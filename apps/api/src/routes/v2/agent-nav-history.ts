import { type Database, getDatabase, navSnapshots } from "@waifufun/db";
import { and, asc, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";

const app = new Hono();
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600";
const WINDOWS = new Set(["24h", "7d", "30d", "all"]);
const INTERVALS = new Set(["1h", "1d"]);

type NavHistoryWindow = "24h" | "7d" | "30d" | "all";
type NavHistoryInterval = "1h" | "1d";

type NavHistoryRow = { snapshotAt: Date; navUsd: string };
type AgentNavHistoryDepsForTest = {
	db?: Database;
	now?: () => Date;
	listRows?: (address: string, cutoff: Date | null) => Promise<NavHistoryRow[]>;
};
const agentNavHistoryDepsForTest: AgentNavHistoryDepsForTest = {};

export function __setAgentNavHistoryRoutesDepsForTest(deps: Partial<AgentNavHistoryDepsForTest>): void {
	for (const key of Object.keys(agentNavHistoryDepsForTest) as Array<keyof AgentNavHistoryDepsForTest>)
		delete agentNavHistoryDepsForTest[key];
	Object.assign(agentNavHistoryDepsForTest, deps);
}

function requireDb(): Database | null {
	if (agentNavHistoryDepsForTest.db) return agentNavHistoryDepsForTest.db;
	const url = process.env.DATABASE_URL;
	if (!url) return null;
	return getDatabase(url).db;
}

function invalidAddress(c: Context) {
	return c.json({ ok: false, error: "INVALID_ADDRESS", message: "invalid agent token address" }, 400);
}

function parseWindow(value: string | undefined): NavHistoryWindow | null {
	const window = value ?? "7d";
	return WINDOWS.has(window) ? (window as NavHistoryWindow) : null;
}

function parseInterval(value: string | undefined): NavHistoryInterval | null {
	const interval = value ?? "1h";
	return INTERVALS.has(interval) ? (interval as NavHistoryInterval) : null;
}

function cutoffFor(window: NavHistoryWindow, now: Date): Date | null {
	if (window === "all") return null;
	const hours = window === "24h" ? 24 : window === "7d" ? 24 * 7 : 24 * 30;
	return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function utcDayKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

app.get("/:address/nav-history", async (c) => {
	const address = c.req.param("address").toLowerCase();
	if (!ADDRESS_RE.test(address)) return invalidAddress(c);

	const window = parseWindow(c.req.query("window"));
	if (!window)
		return c.json({ ok: false, error: "INVALID_WINDOW", message: "window must be 24h, 7d, 30d, or all" }, 400);
	const interval = parseInterval(c.req.query("interval"));
	if (!interval) return c.json({ ok: false, error: "INVALID_INTERVAL", message: "interval must be 1h or 1d" }, 400);

	const cutoff = cutoffFor(window, agentNavHistoryDepsForTest.now?.() ?? new Date());
	const rows = agentNavHistoryDepsForTest.listRows
		? await agentNavHistoryDepsForTest.listRows(address, cutoff)
		: await (async () => {
				const db = requireDb();
				if (!db) return null;
				const filters = cutoff
					? and(eq(navSnapshots.agentTokenAddress, address), gte(navSnapshots.snapshotAt, cutoff))
					: eq(navSnapshots.agentTokenAddress, address);
				return await db
					.select({ snapshotAt: navSnapshots.snapshotAt, navUsd: navSnapshots.navUsd })
					.from(navSnapshots)
					.where(filters)
					.orderBy(asc(navSnapshots.snapshotAt));
			})();
	if (!rows) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);

	const hourlyPoints = rows.map((row) => ({ t: row.snapshotAt.toISOString(), nav: Number(row.navUsd) }));
	const points =
		interval === "1h"
			? hourlyPoints
			: Array.from(new Map(hourlyPoints.map((point) => [utcDayKey(new Date(point.t)), point])).values());

	c.header("Cache-Control", CACHE_CONTROL);
	return c.json({ ok: true, data: { points } });
});

export default app;
