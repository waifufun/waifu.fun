/**
 * Drizzle queries for agent_launches + launch_{deposits,withdrawals,claims}.
 *
 * Kept thin: anything that needs the on-chain view of the world should go
 * through {@link LaunchService} instead. This module only owns the persisted
 * snapshot the indexer maintains.
 */

import { and, count, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";

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

export async function getLaunchByPredictedToken(db: Database, tokenAddress: string): Promise<AgentLaunchRow | null> {
	const [row] = await db
		.select()
		.from(agentLaunches)
		.where(eq(agentLaunches.predictedTokenAddress, tokenAddress.toLowerCase()))
		.limit(1);
	return row ?? null;
}

export async function listBundlePendingReady(db: Database, nowSeconds: bigint): Promise<AgentLaunchRow[]> {
	return db
		.select()
		.from(agentLaunches)
		.where(
			and(
				lte(agentLaunches.closeTimestamp, nowSeconds),
				inArray(agentLaunches.bundleStatus, ["pending", "failed_retry"]),
				lt(agentLaunches.bundleAttempt, 3),
			),
		);
}

export interface InsertLaunchInput {
	tokenAddress: string;
	vaultAddress: string;
	routerAddress: string;
	taxSplitterAddress?: string | null;
	treasuryLpAddress?: string | null;
	creator: string;
	tier: number;
	presaleCap: string;
	v2BuyBnb: string;
	vestingEnabled: boolean;
	closeTimestamp: bigint;
	metadata?: Record<string, unknown>;
	metadataUri?: string | null;
	predictedTokenAddress?: string | null;
	vanitySalt?: string | null;
	flapMetaCid?: string | null;
	bundleTipBnb?: string | null;
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
			taxSplitterAddress: input.taxSplitterAddress?.toLowerCase() ?? null,
			treasuryLpAddress: input.treasuryLpAddress?.toLowerCase() ?? null,
			creator: input.creator.toLowerCase(),
			tier: input.tier,
			presaleCap: input.presaleCap,
			v2BuyBnb: input.v2BuyBnb,
			vestingEnabled: input.vestingEnabled ? 1 : 0,
			closeTimestamp: input.closeTimestamp,
			metadata: input.metadata ?? {},
			metadataUri: input.metadataUri ?? null,
			predictedTokenAddress: input.predictedTokenAddress?.toLowerCase() ?? null,
			vanitySalt: input.vanitySalt?.toLowerCase() ?? null,
			flapMetaCid: input.flapMetaCid ?? null,
			bundleTipBnb: input.bundleTipBnb ?? "0.03",
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

export interface ListDepositorsQuery {
	limit?: number;
	offset?: number;
}

function toDepositorAggregate(row: Record<string, string>): DepositorAggregate {
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
}

export async function countDepositors(db: Database, launchId: string): Promise<number> {
	const rows = await db.execute<{ count: string }>(sql`
		SELECT COUNT(*)::text AS count
		FROM (
			SELECT user_address FROM launch_deposits WHERE launch_id = ${launchId}::uuid
			UNION
			SELECT user_address FROM launch_withdrawals WHERE launch_id = ${launchId}::uuid
			UNION
			SELECT user_address FROM launch_claims WHERE launch_id = ${launchId}::uuid
		) AS touched
	`);
	const rawRows = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
	const row = (rawRows as Array<Record<string, string>>)[0];
	return Number(row?.count ?? 0);
}

export async function listDepositors(
	db: Database,
	launchId: string,
	query: ListDepositorsQuery = {},
): Promise<DepositorAggregate[]> {
	const limit = query.limit ?? 1000;
	const offset = query.offset ?? 0;
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
		LIMIT ${limit}
		OFFSET ${offset}
	`);

	const rawRows = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
	return (rawRows as Array<Record<string, string>>)
		.filter((row) => Boolean(row.user_address))
		.map(toDepositorAggregate);
}

export async function getDepositorAggregate(
	db: Database,
	launchId: string,
	userAddress: string,
): Promise<DepositorAggregate | null> {
	const normalized = userAddress.toLowerCase();
	const rows = await db.execute<{
		user_address: string;
		deposited: string;
		withdrawn: string;
		claimed: string;
	}>(sql`
		WITH d AS (
			SELECT SUM(amount::numeric) AS deposited
			FROM launch_deposits
			WHERE launch_id = ${launchId}::uuid AND user_address = ${normalized}
		),
		w AS (
			SELECT SUM(amount::numeric) AS withdrawn
			FROM launch_withdrawals
			WHERE launch_id = ${launchId}::uuid AND user_address = ${normalized}
		),
		c AS (
			SELECT SUM(amount::numeric) AS claimed
			FROM launch_claims
			WHERE launch_id = ${launchId}::uuid AND user_address = ${normalized}
		)
		SELECT
			${normalized} AS user_address,
			COALESCE(d.deposited, 0)::text AS deposited,
			COALESCE(w.withdrawn, 0)::text AS withdrawn,
			COALESCE(c.claimed, 0)::text AS claimed
		FROM d, w, c
	`);

	const rawRows = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
	const row = (rawRows as Array<Record<string, string>>)[0];
	if (!row) return null;
	const aggregate = toDepositorAggregate(row);
	if (aggregate.deposited === "0" && aggregate.withdrawn === "0" && aggregate.claimed === "0") return null;
	return aggregate;
}

export async function listDeposits(db: Database, launchId: string): Promise<LaunchDepositRow[]> {
	return db
		.select()
		.from(launchDeposits)
		.where(eq(launchDeposits.launchId, launchId))
		.orderBy(desc(launchDeposits.blockNumber));
}

/**
 * One row per launch the user has touched (deposit, withdraw, or claim),
 * with their net deposit + claimed totals. Returned ordered by launch
 * created_at desc so newest backed launches sort first.
 *
 * The on-chain `claimable` view is intentionally NOT computed here — the
 * route layer multicalls vaults to fill it in.
 */
export interface UserLaunchAggregate {
	launch: AgentLaunchRow;
	deposited: string;
	withdrawn: string;
	netDeposit: string;
	claimed: string;
}

export async function listUserLaunches(db: Database, userAddress: string): Promise<UserLaunchAggregate[]> {
	const normalized = userAddress.toLowerCase();

	const rows = await db.execute<{
		launch_id: string;
		deposited: string | null;
		withdrawn: string | null;
		claimed: string | null;
	}>(sql`
		WITH d AS (
			SELECT launch_id, SUM(amount::numeric) AS deposited
			FROM launch_deposits
			WHERE user_address = ${normalized}
			GROUP BY launch_id
		),
		w AS (
			SELECT launch_id, SUM(amount::numeric) AS withdrawn
			FROM launch_withdrawals
			WHERE user_address = ${normalized}
			GROUP BY launch_id
		),
		c AS (
			SELECT launch_id, SUM(amount::numeric) AS claimed
			FROM launch_claims
			WHERE user_address = ${normalized}
			GROUP BY launch_id
		)
		SELECT
			COALESCE(d.launch_id, w.launch_id, c.launch_id) AS launch_id,
			COALESCE(d.deposited, 0)::text AS deposited,
			COALESCE(w.withdrawn, 0)::text AS withdrawn,
			COALESCE(c.claimed, 0)::text AS claimed
		FROM d
		FULL OUTER JOIN w ON d.launch_id = w.launch_id
		FULL OUTER JOIN c ON COALESCE(d.launch_id, w.launch_id) = c.launch_id
		LIMIT 500
	`);

	const rawRows = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
	const aggregateByLaunch = new Map<string, { deposited: bigint; withdrawn: bigint; claimed: bigint }>();
	for (const row of rawRows as Array<Record<string, string | null>>) {
		const id = row.launch_id;
		if (!id) continue;
		aggregateByLaunch.set(id, {
			deposited: BigInt(row.deposited ?? "0"),
			withdrawn: BigInt(row.withdrawn ?? "0"),
			claimed: BigInt(row.claimed ?? "0"),
		});
	}

	const launchIds = Array.from(aggregateByLaunch.keys());
	if (launchIds.length === 0) return [];

	const launchRows = await db
		.select()
		.from(agentLaunches)
		.where(
			sql`${agentLaunches.id} IN (${sql.join(
				launchIds.map((id) => sql`${id}::uuid`),
				sql`, `,
			)})`,
		)
		.orderBy(desc(agentLaunches.createdAt));

	return launchRows.map((launch) => {
		const agg = aggregateByLaunch.get(launch.id) ?? { deposited: 0n, withdrawn: 0n, claimed: 0n };
		const netDeposit = agg.deposited > agg.withdrawn ? agg.deposited - agg.withdrawn : 0n;
		return {
			launch,
			deposited: agg.deposited.toString(),
			withdrawn: agg.withdrawn.toString(),
			netDeposit: netDeposit.toString(),
			claimed: agg.claimed.toString(),
		};
	});
}
