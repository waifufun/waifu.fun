/**
 * LaunchVault event handlers (wave H). Maps each on-chain event to the
 * canonical agent_launches row plus per-event tables.
 *
 * Coverage:
 *   - RouterSet        → noop except for log (wiring confirmation)
 *   - Deposited        → launch_deposits + agent_launches.totalDeposited
 *   - Withdrawn        → launch_withdrawals + agent_launches.totalDeposited
 *   - Closed           → state=closed + totalDeposited + bonusPool
 *   - LaunchExecuted   → state=launched + launchTimestamp
 *   - Distributed      → flapTokenAddress + bundleStatus=confirmed
 *   - RefundEnabled    → state=failed + failureReason
 *   - Refunded         → launch_withdrawals + totalDeposited + bonusPool
 *   - Claimed          → launch_claims
 *
 * Event visibility is keyed on (tx_hash, log_index, block_hash), so a replay
 * under a different block hash is recorded distinctly (waifufun#601). Aggregate
 * launch-row mutations are gated by the first observed (tx_hash, log_index), so
 * alternate-block visibility rows cannot double-apply side effects (waifufun#819).
 */

import { schema } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import type {
	ClaimedEvent,
	ClosedEvent,
	DepositedEvent,
	DistributedEvent,
	LaunchExecutedEvent,
	RefundEnabledEvent,
	RefundedEvent,
	RouterSetEvent,
	WithdrawnEvent,
} from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";

export interface VaultHandlerContext {
	launchId: string;
}

async function isFirstTxLogObservation(
	runtime: LaunchIndexerRuntime,
	table: typeof schema.launchDeposits | typeof schema.launchWithdrawals | typeof schema.launchClaims,
	txHash: `0x${string}`,
	logIndex: number,
): Promise<boolean> {
	const [seen] = await runtime.db
		.select({ count: sql<number>`count(*)::int` })
		.from(table)
		.where(sql`${table.txHash} = ${txHash} AND ${table.logIndex} = ${logIndex}`);

	return (seen?.count ?? 0) === 1;
}

export async function handleRouterSet(
	runtime: LaunchIndexerRuntime,
	event: RouterSetEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	// Wiring confirmation only; the LaunchCreated handler already wrote the
	// router address. We log so operators can verify wiring happened atomically.
	runtime.logger.debug({ launchId: ctx.launchId, router: event.data.router, tx: event.txHash }, "RouterSet observed");
}

export async function handleDeposited(
	runtime: LaunchIndexerRuntime,
	event: DepositedEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	const inserted = await runtime.db
		.insert(schema.launchDeposits)
		.values({
			launchId: ctx.launchId,
			userAddress: event.data.user.toLowerCase(),
			amount: event.data.amount,
			txHash: event.txHash,
			blockNumber: event.blockNumber,
			blockHash: event.blockHash,
			logIndex: event.logIndex,
		})
		.onConflictDoNothing()
		.returning({ id: schema.launchDeposits.id });

	if (inserted.length === 0) {
		return;
	}
	if (!(await isFirstTxLogObservation(runtime, schema.launchDeposits, event.txHash, event.logIndex))) {
		return;
	}

	// `newTotal` is authoritative on-chain running sum; persist it.
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			totalDeposited: event.data.newTotal,
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	// Bump depositor_count if this is the first deposit row from this user.
	const [existing] = await runtime.db
		.select({ count: sql<number>`count(*)::int` })
		.from(schema.launchDeposits)
		.where(
			sql`${schema.launchDeposits.launchId} = ${ctx.launchId} AND ${schema.launchDeposits.userAddress} = ${event.data.user.toLowerCase()}`,
		);

	if (existing?.count === 1) {
		await runtime.db
			.update(schema.agentLaunches)
			.set({
				depositorCount: sql`${schema.agentLaunches.depositorCount} + 1`,
				updatedAt: sql`now()`,
			})
			.where(eq(schema.agentLaunches.id, ctx.launchId));
	}

	runtime.logger.debug(
		{
			launchId: ctx.launchId,
			user: event.data.user,
			amount: event.data.amount,
			tx: event.txHash,
		},
		"Deposited indexed",
	);
}

export async function handleWithdrawn(
	runtime: LaunchIndexerRuntime,
	event: WithdrawnEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	const inserted = await runtime.db
		.insert(schema.launchWithdrawals)
		.values({
			launchId: ctx.launchId,
			userAddress: event.data.user.toLowerCase(),
			amount: event.data.amount,
			penalty: event.data.penalty,
			txHash: event.txHash,
			blockNumber: event.blockNumber,
			blockHash: event.blockHash,
			logIndex: event.logIndex,
		})
		.onConflictDoNothing()
		.returning({ id: schema.launchWithdrawals.id });

	if (inserted.length === 0) {
		return;
	}
	if (!(await isFirstTxLogObservation(runtime, schema.launchWithdrawals, event.txHash, event.logIndex))) {
		return;
	}

	// totalDeposited shrinks by the gross `amount` withdrawn; the `penalty`
	// stays in the on-chain bonusPool until Closed fires.
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			totalDeposited: sql`(${schema.agentLaunches.totalDeposited})::numeric - ${event.data.amount}::numeric`,
			bonusPool: sql`(${schema.agentLaunches.bonusPool})::numeric + ${event.data.penalty}::numeric`,
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.debug(
		{
			launchId: ctx.launchId,
			user: event.data.user,
			amount: event.data.amount,
			penalty: event.data.penalty,
			tx: event.txHash,
		},
		"Withdrawn indexed",
	);
}

export async function handleClosed(
	runtime: LaunchIndexerRuntime,
	event: ClosedEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			state: "closed",
			totalDeposited: event.data.totalDeposited,
			bonusPool: event.data.bonusPool,
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.info(
		{
			launchId: ctx.launchId,
			totalDeposited: event.data.totalDeposited,
			bonusPool: event.data.bonusPool,
			tx: event.txHash,
		},
		"vault Closed indexed",
	);
}

export async function handleLaunchExecuted(
	runtime: LaunchIndexerRuntime,
	event: LaunchExecutedEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			state: "launched",
			launchTimestamp: BigInt(event.data.timestamp),
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.info(
		{
			launchId: ctx.launchId,
			token: event.data.token,
			totalBnb: event.data.totalBnb,
			timestamp: event.data.timestamp,
			tx: event.txHash,
		},
		"vault LaunchExecuted indexed",
	);
}

export async function handleDistributed(
	runtime: LaunchIndexerRuntime,
	event: DistributedEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			flapTokenAddress: event.data.token.toLowerCase(),
			bundleStatus: "confirmed",
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.info(
		{
			launchId: ctx.launchId,
			token: event.data.token,
			presalerShare: event.data.presalerShare,
			tx: event.txHash,
		},
		"vault Distributed indexed",
	);
}

export async function handleRefundEnabled(
	runtime: LaunchIndexerRuntime,
	event: RefundEnabledEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			state: "failed",
			failureReason: event.data.reason,
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.info(
		{
			launchId: ctx.launchId,
			reason: event.data.reason,
			by: event.data.by,
			tx: event.txHash,
		},
		"RefundEnabled indexed",
	);
}

export async function handleRefunded(
	runtime: LaunchIndexerRuntime,
	event: RefundedEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	const inserted = await runtime.db
		.insert(schema.launchWithdrawals)
		.values({
			launchId: ctx.launchId,
			userAddress: event.data.user.toLowerCase(),
			amount: event.data.principal,
			penalty: "0",
			txHash: event.txHash,
			blockNumber: event.blockNumber,
			blockHash: event.blockHash,
			logIndex: event.logIndex,
		})
		.onConflictDoNothing()
		.returning({ id: schema.launchWithdrawals.id });

	if (inserted.length === 0) {
		return;
	}
	if (!(await isFirstTxLogObservation(runtime, schema.launchWithdrawals, event.txHash, event.logIndex))) {
		return;
	}

	await runtime.db
		.update(schema.agentLaunches)
		.set({
			totalDeposited: sql`GREATEST((${schema.agentLaunches.totalDeposited})::numeric - ${event.data.principal}::numeric, 0)::text`,
			bonusPool: sql`GREATEST((${schema.agentLaunches.bonusPool})::numeric - ${event.data.bonus}::numeric, 0)::text`,
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.debug(
		{
			launchId: ctx.launchId,
			user: event.data.user,
			principal: event.data.principal,
			bonus: event.data.bonus,
			refundAmount: event.data.refundAmount,
			tx: event.txHash,
		},
		"Refunded indexed",
	);
}

export async function handleClaimed(
	runtime: LaunchIndexerRuntime,
	event: ClaimedEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	await runtime.db
		.insert(schema.launchClaims)
		.values({
			launchId: ctx.launchId,
			userAddress: event.data.user.toLowerCase(),
			amount: event.data.amount,
			txHash: event.txHash,
			blockNumber: event.blockNumber,
			blockHash: event.blockHash,
			logIndex: event.logIndex,
		})
		.onConflictDoNothing();

	runtime.logger.debug(
		{
			launchId: ctx.launchId,
			user: event.data.user,
			amount: event.data.amount,
			tx: event.txHash,
		},
		"Claimed indexed",
	);
}
