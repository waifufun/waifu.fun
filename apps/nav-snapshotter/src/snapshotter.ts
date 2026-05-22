import { type Database, agentPersonas, navSnapshots } from "@waifufun/db";
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { buildNavSnapshot } from "../../api/src/services/nav/aggregator.js";
import type { NavSnapshot } from "../../api/src/services/nav/types.js";

export type SnapshotSource = "scheduled" | "manual";

export interface NavSnapshotterDeps {
	db: Database;
	now?: () => Date;
	listActiveAgents?: () => Promise<string[]>;
	buildSnapshot?: (agentTokenAddress: string) => Promise<NavSnapshot>;
	insertSnapshot?: (snapshot: NavSnapshot, snapshotAt: Date, source: SnapshotSource) => Promise<boolean>;
}

export interface NavSnapshotterResult {
	agentCount: number;
	insertedCount: number;
	skippedCount: number;
	failedCount: number;
	failures: Array<{ agentTokenAddress: string; error: string }>;
}

export function hourStart(date: Date): Date {
	const started = new Date(date);
	started.setUTCMinutes(0, 0, 0);
	return started;
}

export function nextHour(date: Date): Date {
	return new Date(hourStart(date).getTime() + 60 * 60 * 1000);
}

export async function listActiveAgentTokenAddresses(db: Database): Promise<string[]> {
	const rows = await db
		.select({ tokenAddress: agentPersonas.tokenAddress })
		.from(agentPersonas)
		.where(
			and(
				eq(agentPersonas.agentLaunchStatus, "launched"),
				sql`${agentPersonas.tokenAddress} is not null`,
				sql`${agentPersonas.killedAt} is null`,
			),
		)
		.orderBy(agentPersonas.tokenAddress);
	return rows.map((row) => row.tokenAddress?.toLowerCase()).filter((address): address is string => Boolean(address));
}

export async function insertNavSnapshot(
	db: Database,
	snapshot: NavSnapshot,
	snapshotAt: Date,
	source: SnapshotSource = "scheduled",
): Promise<boolean> {
	const start = hourStart(snapshotAt);
	const end = nextHour(snapshotAt);
	const [existing] = await db
		.select({ id: navSnapshots.id })
		.from(navSnapshots)
		.where(
			and(
				eq(navSnapshots.agentTokenAddress, snapshot.agentTokenAddress),
				gte(navSnapshots.snapshotAt, start),
				lt(navSnapshots.snapshotAt, end),
			),
		)
		.limit(1);
	if (existing) return false;

	const pricedNavUsd = snapshot.holdings.reduce(
		(sum, holding) => sum + (holding.priced ? (holding.valueUsd ?? 0) : 0),
		0,
	);
	const walletIds = new Set(snapshot.holdings.map((holding) => holding.walletId));
	const inserted = await db
		.insert(navSnapshots)
		.values({
			agentTokenAddress: snapshot.agentTokenAddress,
			snapshotAt,
			navUsd: snapshot.navUsd.toString(),
			pricedNavUsd: pricedNavUsd.toFixed(8),
			unpricedCount: snapshot.unpriced.count,
			byChain: snapshot.byChain,
			byRole: snapshot.byRole,
			walletCount: walletIds.size,
			holdingsCount: snapshot.holdings.length,
			source,
		})
		.onConflictDoNothing()
		.returning({ id: navSnapshots.id });
	return inserted.length > 0;
}

export async function runNavSnapshotter(
	deps: NavSnapshotterDeps,
	source: SnapshotSource = "scheduled",
): Promise<NavSnapshotterResult> {
	const snapshotAt = deps.now?.() ?? new Date();
	const listAgents = deps.listActiveAgents ?? (() => listActiveAgentTokenAddresses(deps.db));
	const buildSnapshotForAgent = deps.buildSnapshot ?? ((address: string) => buildNavSnapshot(address, { db: deps.db }));
	const insertSnapshotForAgent =
		deps.insertSnapshot ??
		((snapshot: NavSnapshot, at: Date, snapshotSource: SnapshotSource) =>
			insertNavSnapshot(deps.db, snapshot, at, snapshotSource));

	const agents = await listAgents();
	let insertedCount = 0;
	let skippedCount = 0;
	const failures: NavSnapshotterResult["failures"] = [];

	for (const agentTokenAddress of agents) {
		try {
			const snapshot = await buildSnapshotForAgent(agentTokenAddress);
			const inserted = await insertSnapshotForAgent(snapshot, snapshotAt, source);
			if (inserted) insertedCount += 1;
			else skippedCount += 1;
		} catch (error) {
			failures.push({ agentTokenAddress, error: error instanceof Error ? error.message : String(error) });
		}
	}

	return {
		agentCount: agents.length,
		insertedCount,
		skippedCount,
		failedCount: failures.length,
		failures,
	};
}
