/**
 * Drizzle queries for agent_launches + launch_{deposits,withdrawals,claims}.
 *
 * Kept thin: anything that needs the on-chain view of the world should go
 * through {@link LaunchService} instead. This module only owns the persisted
 * snapshot the indexer maintains.
 */

import { and, count, desc, eq, sql } from "drizzle-orm";

import { type AgentLaunchRow, type LaunchDepositRow, agentLaunches, launchDeposits } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

export interface ListLaunchesQuery {
	creator?: string | undefined;
	state?: AgentLaunchRow["state"] | undefined;
	tier?: number | undefined;
	limit: number;
	offset: number;
}

export interface ListLaunchesResult {
	launches: AgentLaunchRow[];
	total: number;
}

export async function listLaunches(db: Database, query: ListLaunchesQuery): Promise<ListLaunchesResult> {
	const filters = [];
	if (query.creator) filters.push(eq(agentLaunches.creator, query.creator.toLowerCase()));
	if (query.state) filters.push(eq(agentLaunches.state, query.state));
	if (typeof query.tier === "number") filters.push(eq(agentLaunches.tier, query.tier));

	const where = filters.length > 0 ? and(...filters) : undefined;

	const rows = await db
		.select()
		.from(agentLaunches)
		.where(where)
		.orderBy(desc(agentLaunches.createdAt))
		.limit(query.limit)
		.offset(query.offset);

	const totalRows = await db.select({ value: count() }).from(agentLaunches).where(where);
	const total = Number(totalRows[0]?.value ?? 0);

	return { launches: rows, total };
}

export async function getLaunchById(db: Database, id: string): Promise<AgentLaunchRow | null> {
	const [row] = await db.select().from(agentLaunches).where(eq(agentLaunches.id, id)).limit(1);
	return row ?? null;
}

export async function getLaunchByToken(db: Database, tokenAddress: string): Promise<AgentLaunchRow | null> {
	const [row] = await db
		.select()
		.from(agentLaunches)
		.where(eq(agentLaunches.tokenAddress, tokenAddress.toLowerCase()))
		.limit(1);
	return row ?? null;
}

export interface InsertLaunchInput {
	tokenAddress: string;
	vaultAddress: string;
	routerAddress: string;
	creator: string;
	tier: number;
	presaleCap: string;
	v2BuyBnb: string;
	vestingEnabled: boolean;
	closeTimestamp: bigint;
	metadataUri?: string | null;
	createTxHash?: string | null;
	createBlockNumber?: bigint | null;
}

export async function insertLaunch(db: Database, input: InsertLaunchInput): Promise<AgentLaunchRow> {
	const rows = await db
		.insert(agentLaunches)
		.values({
			tokenAddress: input.tokenAddress.toLowerCase(),
			vaultAddress: input.vaultAddress.toLowerCase(),
			routerAddress: input.routerAddress.toLowerCase(),
			creator: input.creator.toLowerCase(),
			tier: input.tier,
			presaleCap: input.presaleCap,
			v2BuyBnb: input.v2BuyBnb,
			vestingEnabled: input.vestingEnabled ? 1 : 0,
			closeTimestamp: input.closeTimestamp,
			metadataUri: input.metadataUri ?? null,
			createTxHash: input.createTxHash?.toLowerCase() ?? null,
			createBlockNumber: input.createBlockNumber ?? null,
		})
		.returning();
	const row = rows[0];
	if (!row) {
		throw new Error("insertLaunch returned no rows");
	}
	return row;
}

/**
 * Per-launch deposit aggregate (one row per address).
 *
 * Computed: net deposit = sum(deposits) - sum(withdrawals).
 * `claimable` is left null here — the route layer fills it in by reading
 * the on-chain `claimableOf(user)` view.
 */
export interface DepositorAggregate {
	address: string;
	deposited: string;
	withdrawn: string;
	netDeposit: string;
	claimed: string;
}

export async function listDepositors(db: Database, launchId: string): Promise<DepositorAggregate[]> {
	const rows = await db.execute<{
		user_address: string;
		deposited: string;
		withdrawn: string;
		claimed: string;
	}>(sql`
		WITH d AS (
			SELECT user_address, SUM(amount::numeric) AS deposited
			FROM launch_deposits
			WHERE launch_id = ${launchId}::uuid
			GROUP BY user_address
		),
		w AS (
			SELECT user_address, SUM(amount::numeric) AS withdrawn
			FROM launch_withdrawals
			WHERE launch_id = ${launchId}::uuid
			GROUP BY user_address
		),
		c AS (
			SELECT user_address, SUM(amount::numeric) AS claimed
			FROM launch_claims
			WHERE launch_id = ${launchId}::uuid
			GROUP BY user_address
		)
		SELECT
			COALESCE(d.user_address, w.user_address, c.user_address) AS user_address,
			COALESCE(d.deposited, 0)::text AS deposited,
			COALESCE(w.withdrawn, 0)::text AS withdrawn,
			COALESCE(c.claimed, 0)::text AS claimed
		FROM d
		FULL OUTER JOIN w ON d.user_address = w.user_address
		FULL OUTER JOIN c ON COALESCE(d.user_address, w.user_address) = c.user_address
		ORDER BY deposited DESC NULLS LAST
		LIMIT 1000
	`);

	const rawRows = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
	return (rawRows as Array<Record<string, string>>)
		.filter((row) => Boolean(row.user_address))
		.map((row) => {
			const deposited = BigInt(row.deposited ?? "0");
			const withdrawn = BigInt(row.withdrawn ?? "0");
			const netDeposit = deposited > withdrawn ? deposited - withdrawn : 0n;
			return {
				address: row.user_address as string,
				deposited: deposited.toString(),
				withdrawn: withdrawn.toString(),
				netDeposit: netDeposit.toString(),
				claimed: row.claimed ?? "0",
			};
		});
}

export async function getDepositorAggregate(
	db: Database,
	launchId: string,
	userAddress: string,
): Promise<DepositorAggregate | null> {
	const all = await listDepositors(db, launchId);
	return all.find((row) => row.address.toLowerCase() === userAddress.toLowerCase()) ?? null;
}

export async function listDeposits(db: Database, launchId: string): Promise<LaunchDepositRow[]> {
	return db
		.select()
		.from(launchDeposits)
		.where(eq(launchDeposits.launchId, launchId))
		.orderBy(desc(launchDeposits.blockNumber));
}
