import { Hono } from "hono";
import type { Context } from "hono";

import { agentPersonas, agentWalletRegistry, getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

const app = new Hono();

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const CACHE_CONTROL = "public, max-age=30, stale-while-revalidate=60";

type AgentWalletDto = {
	id: string;
	address: string;
	chain: string;
	role: string;
	venue: string | null;
	label: string;
	ownerType: string;
	addedAt: number;
};

type AgentWalletDepsForTest = {
	db: Database | undefined;
	getAgentTokenAddress: ((db: Database, address: string) => Promise<string | null>) | undefined;
	listWallets: ((db: Database, agentTokenAddress: string) => Promise<AgentWalletDto[]>) | undefined;
};

const agentWalletDepsForTest: AgentWalletDepsForTest = {
	db: undefined,
	getAgentTokenAddress: undefined,
	listWallets: undefined,
};

export function __setAgentWalletRoutesDepsForTest(deps: Partial<AgentWalletDepsForTest>): void {
	agentWalletDepsForTest.db = deps.db;
	agentWalletDepsForTest.getAgentTokenAddress = deps.getAgentTokenAddress;
	agentWalletDepsForTest.listWallets = deps.listWallets;
}

function requireDb(): Database | null {
	if (agentWalletDepsForTest.db) return agentWalletDepsForTest.db;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function epochSeconds(value: Date | string | number): number {
	const date = value instanceof Date ? value : new Date(value);
	return Math.floor(date.getTime() / 1000);
}

function serializeWallet(row: typeof agentWalletRegistry.$inferSelect): AgentWalletDto {
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

async function listWallets(db: Database, agentTokenAddress: string): Promise<AgentWalletDto[]> {
	const rows = await db
		.select()
		.from(agentWalletRegistry)
		.where(eq(agentWalletRegistry.agentTokenAddress, agentTokenAddress))
		.orderBy(agentWalletRegistry.role, agentWalletRegistry.label, agentWalletRegistry.address);
	return rows.map(serializeWallet);
}

function invalidAddress(c: Context) {
	return c.json({ ok: false, error: "INVALID_ADDRESS", message: "invalid agent token address" }, 400);
}

app.get("/:address/wallets", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "database unavailable" }, 503);

	const address = c.req.param("address").toLowerCase();
	if (!ADDRESS_RE.test(address)) return invalidAddress(c);

	try {
		const readAgentTokenAddress = agentWalletDepsForTest.getAgentTokenAddress ?? getAgentTokenAddress;
		const readWallets = agentWalletDepsForTest.listWallets ?? listWallets;
		const agentTokenAddress = await readAgentTokenAddress(db, address);
		if (!agentTokenAddress) {
			return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: "agent not found" }, 404);
		}

		const wallets = await readWallets(db, agentTokenAddress);
		c.header("Cache-Control", CACHE_CONTROL);
		return c.json({ ok: true, data: { agentTokenAddress, wallets } });
	} catch (err) {
		return c.json(
			{
				ok: false,
				error: "FAILED_TO_LOAD_AGENT_WALLETS",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

export default app;
