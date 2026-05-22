import { Hono } from "hono";
import type { Context } from "hono";

import { agentPersonas, agentWalletRegistry, getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db";
import type { AgentWallet } from "@waifufun/types";
import { eq, sql } from "drizzle-orm";

import { computeBurnRate } from "../../../services/nav/burn-rate.js";
import type { BurnSnapshot } from "../../../services/nav/burn-rate.js";

const app = new Hono();

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

type BurnRateRouteDepsForTest = {
	db: Database | undefined;
	getAgentTokenAddress: ((db: Database, address: string) => Promise<string | null>) | undefined;
	listWallets: ((db: Database, agentTokenAddress: string) => Promise<AgentWallet[]>) | undefined;
	readNavUsd: ((db: Database, agentTokenAddress: string) => Promise<number>) | undefined;
	computeBurnRate:
		| ((agentTokenAddress: string, wallets: AgentWallet[], navUsd: number) => Promise<BurnSnapshot>)
		| undefined;
};

const burnRateRouteDepsForTest: BurnRateRouteDepsForTest = {
	db: undefined,
	getAgentTokenAddress: undefined,
	listWallets: undefined,
	readNavUsd: undefined,
	computeBurnRate: undefined,
};

export function __setBurnRateRouteDepsForTest(deps: Partial<BurnRateRouteDepsForTest>): void {
	burnRateRouteDepsForTest.db = deps.db;
	burnRateRouteDepsForTest.getAgentTokenAddress = deps.getAgentTokenAddress;
	burnRateRouteDepsForTest.listWallets = deps.listWallets;
	burnRateRouteDepsForTest.readNavUsd = deps.readNavUsd;
	burnRateRouteDepsForTest.computeBurnRate = deps.computeBurnRate;
}

function requireDb(): Database | null {
	if (burnRateRouteDepsForTest.db) return burnRateRouteDepsForTest.db;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function epochSeconds(value: Date | string | number): number {
	const date = value instanceof Date ? value : new Date(value);
	return Math.floor(date.getTime() / 1000);
}

function serializeWallet(row: typeof agentWalletRegistry.$inferSelect): AgentWallet {
	return {
		id: row.id,
		address: row.address,
		chain: row.chain,
		role: row.role,
		venue: row.venue,
		label: row.label,
		ownerType: row.ownerType,
		addedAt: epochSeconds(row.addedAt),
	};
}

async function getAgentTokenAddress(db: Database, address: string): Promise<string | null> {
	const [agent] = await db
		.select({ tokenAddress: agentPersonas.tokenAddress })
		.from(agentPersonas)
		.where(sql`lower(${agentPersonas.tokenAddress}) = ${address}`)
		.limit(1);
	return agent?.tokenAddress ? agent.tokenAddress.toLowerCase() : null;
}

async function listWallets(db: Database, agentTokenAddress: string): Promise<AgentWallet[]> {
	const rows = await db
		.select()
		.from(agentWalletRegistry)
		.where(eq(agentWalletRegistry.agentTokenAddress, agentTokenAddress))
		.orderBy(agentWalletRegistry.role, agentWalletRegistry.label, agentWalletRegistry.address);
	return rows.map(serializeWallet);
}

async function readNavUsd(_db: Database, _agentTokenAddress: string): Promise<number> {
	// Phase 2 NAV aggregation is not mounted in this branch yet. Keep the burn-rate
	// primitive live now and let the holdings/NAV worker replace this with the real
	// treasury value, preserving the runway formula in computeBurnRate.
	return 0;
}

function invalidAddress(c: Context) {
	return c.json({ ok: false, error: "INVALID_ADDRESS", message: "invalid agent token address" }, 400);
}

app.get("/:address/burn-rate", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);

	const address = c.req.param("address").toLowerCase();
	if (!ADDRESS_RE.test(address)) return invalidAddress(c);

	try {
		const readAgentTokenAddress = burnRateRouteDepsForTest.getAgentTokenAddress ?? getAgentTokenAddress;
		const readWallets = burnRateRouteDepsForTest.listWallets ?? listWallets;
		const readAgentNavUsd = burnRateRouteDepsForTest.readNavUsd ?? readNavUsd;
		const compute = burnRateRouteDepsForTest.computeBurnRate ?? computeBurnRate;
		const agentTokenAddress = await readAgentTokenAddress(db, address);
		if (!agentTokenAddress) return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: "agent not found" }, 404);

		const [wallets, navUsd] = await Promise.all([
			readWallets(db, agentTokenAddress),
			readAgentNavUsd(db, agentTokenAddress),
		]);
		const data = await compute(agentTokenAddress, wallets, navUsd);
		c.header("Cache-Control", CACHE_CONTROL);
		return c.json({ ok: true, data });
	} catch (err) {
		return c.json(
			{ ok: false, error: "FAILED_TO_LOAD_AGENT_BURN_RATE", detail: err instanceof Error ? err.message : String(err) },
			500,
		);
	}
});

export default app;
