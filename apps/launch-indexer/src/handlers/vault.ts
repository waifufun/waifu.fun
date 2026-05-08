/**
 * LaunchVault event handlers. Maps Deposited / Withdrawn / Closed / Launched
 * / Claimed → DB rows on launch_deposits, launch_withdrawals, launch_claims,
 * and the canonical agent_launches row.
 *
 * All inserts are idempotent on (tx_hash, log_index) so that re-running the
 * indexer over the same block range does not create duplicates.
 */

import { schema } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import type { ClaimedEvent, ClosedEvent, DepositedEvent, LaunchedEvent, WithdrawnEvent } from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";

export interface VaultHandlerContext {
	launchId: string;
}

export async function handleDeposited(
	runtime: LaunchIndexerRuntime,
	event: DepositedEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	await runtime.db
		.insert(schema.launchDeposits)
		.values({
			launchId: ctx.launchId,
			userAddress: event.data.user.toLowerCase(),
			amount: event.data.amount,
			txHash: event.txHash,
			blockNumber: event.blockNumber,
			logIndex: event.logIndex,
		})
		.onConflictDoNothing();

	// `newTotal` is authoritative on-chain running sum; persist it.
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			totalDeposited: event.data.newTotal,
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	// Optional: bump depositor_count if this is the first deposit from this user.
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
	await runtime.db
		.insert(schema.launchWithdrawals)
		.values({
			launchId: ctx.launchId,
			userAddress: event.data.user.toLowerCase(),
			amount: event.data.amount,
			penalty: event.data.penalty,
			txHash: event.txHash,
			blockNumber: event.blockNumber,
			logIndex: event.logIndex,
		})
		.onConflictDoNothing();

	// totalDeposited is reduced; we recompute by re-reading running totals
	// rather than trying to subtract here (event has refund + penalty, not the
	// on-chain post-state). Cheapest correct path: subtract `amount` (the
	// gross withdrawn). Penalty stays in `bonusPool` until Closed fires.
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			totalDeposited: sql`(${schema.agentLaunches.totalDeposited})::numeric - ${event.data.amount}::numeric`,
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

export async function handleLaunched(
	runtime: LaunchIndexerRuntime,
	event: LaunchedEvent,
	ctx: VaultHandlerContext,
): Promise<void> {
	await runtime.db
		.update(schema.agentLaunches)
		.set({
			state: "launched",
			launchTimestamp: BigInt(event.data.launchTimestamp),
			updatedAt: sql`now()`,
		})
		.where(eq(schema.agentLaunches.id, ctx.launchId));

	runtime.logger.info(
		{
			launchId: ctx.launchId,
			token: event.data.token,
			totalBnb: event.data.totalBnb,
			launchTimestamp: event.data.launchTimestamp,
			tx: event.txHash,
		},
		"vault Launched indexed",
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
