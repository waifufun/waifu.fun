/**
 * Capability registry read surface.
 *
 * GET /v2/agents/:agentId/capabilities
 *
 * Returns the agent's registered capabilities as schema-driven UI descriptors:
 * adapter-backed ones (PancakeSwap v3, Venus) synthesized from agent-actions
 * specs, plus the hand-authored `hyperliquid-perps` reference (wrapping the live
 * HL routes), plus `polymarket` / `tax-arb-vault` planned stubs.
 *
 * This is the READ-PATH scaffold. It performs NO execution and attaches NO
 * Zodiac modules — it just makes capabilities DISCOVERABLE so the Patron UI can
 * auto-render them. Execution (a generic POST .../actions/:action route) is
 * intentionally deferred; the HL deposit/policy actions point at the existing
 * bespoke routes as the compat execution backend.
 *
 * Resolution: accepts the agent's internal persona id (agent_personas.agent_id)
 * or token address. This mirrors the HL/events routes. A sibling worker is
 * hardening the shared `GET /v2/agents/:id` slug/uuid/token resolver
 * (fix/patron-detail-route-resolve); when that lands, this route can adopt the
 * shared helper. Until then it uses the same local persona lookup the rest of
 * the /agents/:id/* surface uses.
 */

import {
	type AgentCapabilitiesResponse,
	type AgentDescriptorContext,
	type CapabilityDescriptor,
	capabilityFromAdapterSpec,
	hyperliquidPerpsDescriptor,
	pancakeV3Spec,
	polymarketDescriptor,
	taxArbVaultDescriptor,
	venusSpec,
} from "@waifufun/agent-actions";
import { agentPersonas, agentWalletRegistry, getDatabase } from "@waifufun/db";
import { and, eq, or } from "drizzle-orm";
import { Hono } from "hono";

const app = new Hono();

type Db = ReturnType<typeof getDatabase>["db"];

/** Injectable deps for tests (matches the codebase __set*DepsForTest convention). */
let testDb: Db | undefined;
export function __setCapabilityRouteDepsForTest(deps: { db?: Db | undefined }): void {
	testDb = deps.db;
}

function requireDb(): Db | null {
	if (testDb) return testDb;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

interface ResolvedAgent {
	/** Internal stable persona id used in endpoint paths. */
	id: string;
	tokenAddress: string | null;
	stewardAgentId: string | null;
}

/** Resolve an agent by internal persona id or token address. */
async function resolveAgent(
	db: NonNullable<ReturnType<typeof requireDb>>,
	idOrToken: string,
): Promise<ResolvedAgent | null> {
	const [persona] = await db
		.select({
			agentId: agentPersonas.agentId,
			tokenAddress: agentPersonas.tokenAddress,
			stewardAgentId: agentPersonas.stewardAgentId,
		})
		.from(agentPersonas)
		.where(or(eq(agentPersonas.agentId, idOrToken), eq(agentPersonas.tokenAddress, idOrToken.toLowerCase())))
		.limit(1);

	if (persona) {
		return {
			id: persona.agentId,
			tokenAddress: persona.tokenAddress ?? null,
			stewardAgentId: persona.stewardAgentId ?? null,
		};
	}

	// Unknown to the persona table but address-shaped — still describable
	// (token-keyed routes resolve downstream). Use the address as the id.
	if (idOrToken.startsWith("0x")) {
		return { id: idOrToken.toLowerCase(), tokenAddress: idOrToken.toLowerCase(), stewardAgentId: null };
	}
	return null;
}

/** Look up the agent's Hyperliquid venue wallet, if registered. */
async function resolveHyperliquidWallet(
	db: NonNullable<ReturnType<typeof requireDb>>,
	tokenAddress: string | null,
): Promise<string | null> {
	if (!tokenAddress) return null;
	const [wallet] = await db
		.select({ address: agentWalletRegistry.address })
		.from(agentWalletRegistry)
		.where(and(eq(agentWalletRegistry.agentTokenAddress, tokenAddress), eq(agentWalletRegistry.venue, "hyperliquid")))
		.limit(1);
	return wallet?.address ?? null;
}

/**
 * Build the full capability list for an agent.
 *
 * Order: reference (HL) first, then adapter-backed (swap/lending), then planned
 * stubs. The adapter-backed descriptors are projected from their specs; their
 * per-agent status stays "available" because live AgentSafes are bare (no Zodiac
 * module) — they can't autonomously execute yet, which the requirement reflects.
 */
function buildCapabilities(ctx: AgentDescriptorContext): CapabilityDescriptor[] {
	return [
		hyperliquidPerpsDescriptor(ctx),
		capabilityFromAdapterSpec(pancakeV3Spec),
		capabilityFromAdapterSpec(venusSpec),
		polymarketDescriptor(ctx),
		taxArbVaultDescriptor(ctx),
	];
}

app.get("/:agentId/capabilities", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	const agentId = c.req.param("agentId");
	const resolved = await resolveAgent(db, agentId);
	if (!resolved) return c.json({ error: "agent not found" }, 404);

	const hyperliquidWallet = await resolveHyperliquidWallet(db, resolved.tokenAddress);

	const ctx: AgentDescriptorContext = {
		id: resolved.id,
		tokenAddress: resolved.tokenAddress,
		hyperliquidWallet,
		stewardAgentId: resolved.stewardAgentId,
	};

	const response: AgentCapabilitiesResponse = {
		agent: { id: resolved.id, tokenAddress: resolved.tokenAddress },
		capabilities: buildCapabilities(ctx),
		ts: Date.now(),
	};

	return c.json(response);
});

export default app;
