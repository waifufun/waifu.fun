import { Hono } from "hono";
import type { Context, Next } from "hono";

import { agentPersonaQueries, agentPersonas, agentQueries, getDatabase } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

import { ensureAgentIdMatches, requireAgentAuth } from "../../middleware/agent-auth.js";
import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import type { RequireAgentOwnershipBindings, RequirePatronBindings } from "../../middleware/patron-auth.js";

import { seedDefaultAdapterPolicies } from "../../services/agent-launch/default-adapter-policies.js";
import {
	AgentLaunchError,
	type AgentLaunchInput,
	FourMemeError,
	type OrchestratorDeps,
	type PersonaStore,
	createOrchestrator,
	createStewardClient,
} from "../../services/agent-launch/index.js";
import { emitAgentEvent } from "../../services/events/emit.js";
import { type MiladyCloudClient, createMiladyCloudClient } from "../../services/milady-client.js";

const app = new Hono<RequireAgentOwnershipBindings>();

// V2 agents routes

const VALID_STATUS = new Set(["active", "graduated", "failed", "pending"]);

export function parseIncludeLegacy(value: string | undefined): boolean {
	return value === "true";
}
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

export type ResurrectAgentDeps = {
	db: ReturnType<typeof getDatabase>["db"];
	miladyClient: Pick<MiladyCloudClient, "topUpCredits">;
	emitEvent?: typeof emitAgentEvent;
};

/**
 * Resurrect a dormant agent after a patron credit top-up.
 * `creditsAmount` is currently a numeric credit amount in USD cents.
 */
export async function resurrectAgent(
	agentId: string,
	creditsAmount: number,
	deps: ResurrectAgentDeps,
): Promise<{ agentId: string; creditsAmount: number; modelTier: "premium" }> {
	await deps.miladyClient.topUpCredits(agentId, creditsAmount);
	const now = new Date();
	await deps.db
		.update(agentPersonas)
		.set({
			dormantAt: null,
			brainPausedAt: null,
			brainPausedReason: null,
			lastWordsPostedAt: null,
			modelTier: "premium",
			creditsTopUpCount: sql`${agentPersonas.creditsTopUpCount} + 1`,
			updatedAt: now,
		})
		.where(eq(agentPersonas.agentId, agentId));

	const emit = deps.emitEvent ?? emitAgentEvent;
	await emit({
		agentId,
		eventType: "agent.resurrected",
		data: { creditsAmount, modelTier: "premium", resurrectedAt: now.toISOString() },
	});

	return { agentId, creditsAmount, modelTier: "premium" };
}

/**
 * POST /v2/agents/:id/resurrect
 *
 * Patron top-up endpoint. Body: { creditsAmount: number } where creditsAmount
 * is represented in USD cents until Milady Cloud finalizes credit units.
 */
app.post("/:id/resurrect", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const agentId = c.get("patronAgent").agentId;
	let body: { creditsAmount?: unknown };
	try {
		body = (await c.req.json()) as { creditsAmount?: unknown };
	} catch {
		return c.json({ error: "invalid JSON body" }, 400);
	}

	if (typeof body.creditsAmount !== "number" || !Number.isFinite(body.creditsAmount) || body.creditsAmount <= 0) {
		return c.json({ error: "creditsAmount must be a positive number", unit: "usd_cents" }, 400);
	}

	const baseUrl = process.env.MILADY_CLOUD_BASE_URL;
	const apiKey = process.env.MILADY_CLOUD_API_KEY ?? "";
	if (!baseUrl) {
		return c.json({ error: "milady cloud unavailable" }, 503);
	}

	try {
		const result = await resurrectAgent(agentId, body.creditsAmount, {
			db,
			miladyClient: createMiladyCloudClient({ baseUrl, apiKey, logger: console }),
		});
		return c.json({ ok: true, ...result, creditsUnit: "usd_cents" }, 200);
	} catch (err) {
		return c.json(
			{
				error: "failed to resurrect agent",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * GET /v2/agents
 *
 * List agents with pagination. Joins agent_personas ← agent_wallets ← curve_state ← tokens.
 *
 * Query params:
 *   - limit  (default 20, max 100)
 *   - offset (default 0)
 *   - status (optional, one of: active | graduated | failed | pending)
 */
async function maybeRequirePatron(c: Context<RequirePatronBindings>, next: Next) {
	const mine = c.req.query("mine") === "true";
	const hasBearer = Boolean(c.req.header("authorization") ?? c.req.header("Authorization"));
	if (mine || hasBearer) return requirePatron()(c, next);
	await next();
}

app.get("/", maybeRequirePatron, async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const limitRaw = c.req.query("limit");
	const offsetRaw = c.req.query("offset");
	const statusRaw = c.req.query("status");
	const includeLegacy = parseIncludeLegacy(c.req.query("includeLegacy"));
	const ownerRaw = c.req.query("owner");
	const mine = c.req.query("mine") === "true";
	const patron = c.get("patron");

	if (mine && !patron) {
		return c.json({ ok: false, error: "UNAUTHORIZED", message: "Steward bearer required" }, 401);
	}

	const ownerAddress = ownerRaw && ADDRESS_RE.test(ownerRaw) ? ownerRaw : undefined;
	if (ownerRaw && !ownerAddress && !patron) {
		return c.json({ error: "invalid owner address" }, 400);
	}

	let limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
	if (!Number.isFinite(limit) || limit <= 0) limit = 20;
	if (limit > 100) limit = 100;

	let offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
	if (!Number.isFinite(offset) || offset < 0) offset = 0;

	let status: agentQueries.AgentApiStatus | undefined;
	if (statusRaw) {
		if (!VALID_STATUS.has(statusRaw)) {
			return c.json(
				{
					error: "invalid status filter",
					allowed: [...VALID_STATUS],
				},
				400,
			);
		}
		status = statusRaw as agentQueries.AgentApiStatus;
	}

	try {
		const result = await agentQueries.listAgents(db, {
			limit,
			offset,
			...(status ? { status } : {}),
			includeLegacy,
			...(mine && patron ? { ownerStewardUserId: patron.stewardUserId } : {}),
			...(!mine && patron && ownerRaw ? { ownerStewardUserId: patron.stewardUserId } : {}),
			...(!mine && ownerAddress ? { ownerAddress } : {}),
		});
		return c.json(result);
	} catch (err) {
		return c.json(
			{
				error: "failed to list agents",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

type AgentControlState = {
	agentId: string;
	brainPausedAt: Date | null;
	brainPausedReason: string | null;
	withdrawalsPausedAt: Date | null;
	withdrawalsPausedReason: string | null;
	killedAt: Date | null;
	killedReason: string | null;
};

async function readControlState(
	db: ReturnType<typeof getDatabase>["db"],
	agentId: string,
): Promise<AgentControlState | null> {
	const [row] = await db
		.select({
			agentId: agentPersonas.agentId,
			brainPausedAt: agentPersonas.brainPausedAt,
			brainPausedReason: agentPersonas.brainPausedReason,
			withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
			withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
			killedAt: agentPersonas.killedAt,
			killedReason: agentPersonas.killedReason,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentId))
		.limit(1);
	return row ?? null;
}

function serializeControlState(state: AgentControlState) {
	const ts = (value: Date | null) => (value ? value.toISOString() : null);
	return {
		agentId: state.agentId,
		brainPaused: state.brainPausedAt !== null,
		brainPausedAt: ts(state.brainPausedAt),
		brainPausedReason: state.brainPausedReason,
		withdrawalsPaused: state.withdrawalsPausedAt !== null,
		withdrawalsPausedAt: ts(state.withdrawalsPausedAt),
		withdrawalsPausedReason: state.withdrawalsPausedReason,
		killed: state.killedAt !== null,
		killedAt: ts(state.killedAt),
		killedReason: state.killedReason,
	};
}

async function parseControlReason(c: Context): Promise<string | null> {
	if (c.req.header("content-length") === "0") return null;
	try {
		const body = await c.req.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) return null;
		const reason = (body as { reason?: unknown }).reason;
		return typeof reason === "string" && reason.trim() ? reason.trim() : null;
	} catch {
		return null;
	}
}

app.post("/:id/pause", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);
	const agentId = c.get("patronAgent").agentId;
	const agent = await readControlState(db, agentId);
	if (!agent) {
		return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: `agent ${agentId} not found` }, 404);
	}
	if (agent.killedAt) {
		return c.json({ ok: false, error: "AGENT_KILLED", message: `agent ${agentId} is permanently killed` }, 409);
	}

	const reason = await parseControlReason(c);
	const now = new Date();
	const [state] = await db
		.update(agentPersonas)
		.set({
			brainPausedAt: now,
			brainPausedReason: reason,
			withdrawalsPausedAt: now,
			withdrawalsPausedReason: reason,
			updatedAt: now,
		})
		.where(eq(agentPersonas.agentId, agentId))
		.returning({
			agentId: agentPersonas.agentId,
			brainPausedAt: agentPersonas.brainPausedAt,
			brainPausedReason: agentPersonas.brainPausedReason,
			withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
			withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
			killedAt: agentPersonas.killedAt,
			killedReason: agentPersonas.killedReason,
		});

	await emitAgentEvent({ agentId, eventType: "agent.paused", data: { scope: "full", reason } });
	return c.json({ ok: true, data: serializeControlState(state ?? agent) });
});

app.post("/:id/kill", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);
	const agentId = c.get("patronAgent").agentId;
	const existing = await readControlState(db, agentId);
	if (!existing) {
		return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: `agent ${agentId} not found` }, 404);
	}
	if (existing.killedAt) {
		return c.json({ ok: false, error: "AGENT_ALREADY_KILLED", message: `agent ${agentId} is already killed` }, 409);
	}

	const reason = await parseControlReason(c);
	const now = new Date();
	const [state] = await db
		.update(agentPersonas)
		.set({
			brainPausedAt: now,
			brainPausedReason: reason,
			withdrawalsPausedAt: now,
			withdrawalsPausedReason: reason,
			killedAt: now,
			killedReason: reason,
			updatedAt: now,
		})
		.where(eq(agentPersonas.agentId, agentId))
		.returning({
			agentId: agentPersonas.agentId,
			brainPausedAt: agentPersonas.brainPausedAt,
			brainPausedReason: agentPersonas.brainPausedReason,
			withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
			withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
			killedAt: agentPersonas.killedAt,
			killedReason: agentPersonas.killedReason,
		});

	await emitAgentEvent({ agentId, eventType: "agent.killed", data: { reason } });
	return c.json({ ok: true, data: serializeControlState(state ?? existing) });
});

/**
 * GET /v2/agents/:tokenAddress
 *
 * Detail view for a single agent, keyed by on-chain token address.
 */
app.get("/:token", async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const token = c.req.param("token");
	if (!ADDRESS_RE.test(token)) {
		return c.json({ error: "invalid token address" }, 400);
	}

	try {
		const detail = await agentQueries.getAgentByTokenAddress(db, token.toLowerCase());
		if (!detail) {
			return c.json({ error: "agent not found" }, 404);
		}
		return c.json(detail);
	} catch (err) {
		return c.json(
			{
				error: "failed to load agent",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * GET /v2/agents/:tokenAddress/trades
 *
 * Last 50 trades for this agent's token (newest first).
 */
app.get("/:token/trades", async (c) => {
	const db = requireDb();
	if (!db) {
		return c.json({ error: "database unavailable" }, 503);
	}

	const token = c.req.param("token");
	if (!ADDRESS_RE.test(token)) {
		return c.json({ error: "invalid token address" }, 400);
	}

	try {
		const trades = await agentQueries.listAgentTrades(db, token.toLowerCase(), 50);
		return c.json({ trades });
	} catch (err) {
		return c.json(
			{
				error: "failed to list trades",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

/**
 * GET /v2/agents/:tokenAddress/fees
 *
 * Returns fee distribution events for this token. Four.Meme TaxToken fees are
 * accrued to the recipient address on-chain; if our indexer has populated
 * `fee_distributions` we return them, otherwise we return an empty array plus
 * a note that this data is currently query-from-chain only.
 */
app.get("/:token/fees", (c) => {
	const token = c.req.param("token");
	if (!ADDRESS_RE.test(token)) {
		return c.json({ error: "invalid token address" }, 400);
	}
	return c.json({
		fees: [],
		note: "four.meme TaxToken fees are query-from-chain for now; on-chain fee events not yet indexed",
	});
});

app.get("/curve/:token", (c) => c.json({ error: "v2 curve query — indexer integration pending" }, 501));

/**
 * POST /v2/agents/launch
 *
 * End-to-end agent launch:
 *   1. Steward provisions an agent wallet (or reuses an existing one)
 *   2. Wallet does SIWE login to Four.Meme API
 *   3. Image is uploaded to Four.Meme
 *   4. Four.Meme API returns (createArg, signature)
 *   5. TokenManager2.createToken is called on-chain via the agent wallet
 *   6. Agent metadata + token address are recorded in the DB
 *
 * Auth: expects a valid caller JWT (Steward or platform admin) — middleware TBD.
 *
 * Body shape matches `AgentLaunchInput` from services/agent-launch/types.ts.
 */
app.post("/launch", requireAgentAuth(), async (c) => {
	let body: AgentLaunchInput;
	try {
		body = (await c.req.json()) as AgentLaunchInput;
	} catch {
		return c.json({ error: "invalid JSON body" }, 400);
	}

	// Basic shape validation — deeper validation lives in the orchestrator.
	if (!body || typeof body !== "object") {
		return c.json({ error: "body must be an object" }, 400);
	}
	if (!body.name || !body.symbol || !body.description) {
		return c.json({ error: "name, symbol, and description are required" }, 400);
	}
	if (!body.imageUrl && !body.imageBase64) {
		return c.json({ error: "either imageUrl or imageBase64 is required" }, 400);
	}

	// If the body carries an explicit agentId, it must match the authed agent.
	const mismatchResp = ensureAgentIdMatches(
		c as unknown as Parameters<typeof ensureAgentIdMatches>[0],
		(body as { agentId?: string }).agentId,
	);
	if (mismatchResp) return mismatchResp;

	// Enforce one-launch-per-agent-lifetime for keys tied to an existing persona
	// that already has a token address.
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);
	const authed = (c as unknown as { get(key: "authedAgent"): { agentId: string } }).get("authedAgent");
	const existing = await agentPersonaQueries.getAgentPersonaByAgentId(db, authed.agentId).catch(() => null);
	if (existing?.tokenAddress) {
		return c.json(
			{
				ok: false,
				error: "AGENT_ALREADY_LAUNCHED",
				message: `Agent ${authed.agentId} already launched token ${existing.tokenAddress}`,
			},
			409,
		);
	}

	let orchestrator: ReturnType<typeof createOrchestrator>;
	try {
		const chainId = Number(process.env.FOURMEME_CHAIN_ID ?? 56);
		if (chainId !== 56 && chainId !== 97) {
			throw new Error("FOURMEME_CHAIN_ID must be 56 or 97");
		}
		const rpcUrl =
			process.env.BSC_RPC_URL ??
			(chainId === 56 ? "https://bsc-dataseed.binance.org" : "https://data-seed-prebsc-1-s1.binance.org:8545");
		const stewardBaseUrl = process.env.STEWARD_API_URL;
		const stewardApiKey = process.env.STEWARD_API_KEY;
		if (!stewardBaseUrl || !stewardApiKey) {
			throw new Error("STEWARD_API_URL and STEWARD_API_KEY env vars required");
		}
		const stewardTenantId = process.env.STEWARD_TENANT_ID ?? "waifu";
		const steward = createStewardClient({
			baseUrl: stewardBaseUrl,
			apiKey: stewardApiKey,
			tenantId: stewardTenantId,
		});
		// Optional persona store (best-effort). If DATABASE_URL is set, write
		// persona rows to the agent_personas table. If not (e.g. bare-bones
		// test env), orchestrator still runs — persona just isn't persisted.
		let personaStore: PersonaStore | undefined;
		if (process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0) {
			const { db } = getDatabase(process.env.DATABASE_URL);
			personaStore = {
				writeInitial: async (args) => {
					// Idempotent: skip if a row already exists for this agentId.
					const existing = await agentPersonaQueries.getAgentPersonaByAgentId(db, args.agentId);
					if (existing) return;
					const personaJson =
						args.persona && typeof args.persona === "object" ? (args.persona as Record<string, unknown>) : undefined;
					const preset = personaJson && typeof personaJson.preset === "string" ? (personaJson.preset as string) : null;
					const systemPrompt =
						personaJson && typeof personaJson.systemPrompt === "string" ? (personaJson.systemPrompt as string) : null;
					const traits =
						personaJson && Array.isArray(personaJson.traits)
							? (personaJson.traits.filter((t: unknown) => typeof t === "string") as string[])
							: [];
					const twitterHandle =
						personaJson && typeof personaJson.twitterHandle === "string" ? (personaJson.twitterHandle as string) : null;
					const persona = await agentPersonaQueries.createAgentPersona(db, {
						agentId: args.agentId,
						name: args.name,
						bio: args.bio ?? null,
						avatarUrl: args.avatarUrl ?? null,
						preset,
						systemPrompt,
						traits,
						twitterHandle,
						metadata: personaJson ?? null,
					});
					await seedDefaultAdapterPolicies(db, persona);
				},
				setToken: async (agentId, tokenAddress) => {
					await agentPersonaQueries.setTokenAddressOnPersona(db, agentId, tokenAddress);
				},
				setIdentity: async (agentId, identity) => {
					await agentPersonaQueries.setPersonaIdentity(db, agentId, identity);
				},
			};
		}

		const deps: OrchestratorDeps = {
			steward,
			rpcUrl,
			chainId: chainId as 56 | 97,
			...(process.env.FOURMEME_API_URL ? { fourMemeBaseUrl: process.env.FOURMEME_API_URL } : {}),
			...(process.env.FOURMEME_TOKEN_MANAGER_2
				? {
						tokenManager2Address: process.env.FOURMEME_TOKEN_MANAGER_2 as `0x${string}`,
					}
				: {}),
			...(process.env.EIP8004_NFT_ADDRESS
				? {
						eip8004NftAddress: process.env.EIP8004_NFT_ADDRESS as `0x${string}`,
					}
				: {}),
			platformSlug: "waifu",
			...(personaStore ? { personaStore } : {}),
		};
		orchestrator = createOrchestrator(deps);
	} catch (err) {
		// Config missing (Steward URL, private key, etc.)
		return c.json(
			{
				error: "orchestrator unavailable",
				detail: err instanceof Error ? err.message : String(err),
			},
			503,
		);
	}

	try {
		const result = await orchestrator.launch(body);
		return c.json(
			{
				agentId: result.agentId,
				walletAddress: result.walletAddress,
				tokenAddress: result.tokenAddress,
				treasuryAddress: result.treasuryAddress,
				txHash: result.txHash,
				fourMeme: result.fourMeme,
				...(result.agentIdentity ? { agentIdentity: result.agentIdentity } : {}),
			},
			200,
		);
	} catch (err) {
		if (err instanceof FourMemeError) {
			return c.json(
				{
					error: "four.meme error",
					status: err.status,
					detail: err.message,
					body: err.body ?? null,
				},
				502,
			);
		}
		if (err instanceof AgentLaunchError) {
			return c.json({ error: "agent launch error", step: err.step, detail: err.message }, 500);
		}
		return c.json(
			{
				error: "internal error",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

// Legacy/placeholder — keep for compat with any existing callers.
app.post("/create", (c) => c.json({ error: "use POST /v2/agents/launch instead", redirect: "/v2/agents/launch" }, 410));

export default app;
