import { agentPersonas, agents, getDatabase, tokens } from "@waifufun/db";
import type { Database } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import type { RequireAgentOwnershipBindings } from "../../middleware/patron-auth.js";
import {
	type ElizaAgentMessageResult,
	ElizaApiError,
	type ElizaCloudClient,
	createElizaCloudClient,
	resolveElizaCloudApiKey,
} from "../../services/eliza-client.js";
import { elizaUnavailableBody, isElizaCloudUnavailable } from "./eliza-unavailable.js";

const app = new Hono<RequireAgentOwnershipBindings>();

const MAX_MESSAGE_CHARS = 4_000;

type ChatRouteDeps = {
	db: Database | undefined;
	elizaClient: Pick<ElizaCloudClient, "sendAgentMessage"> | undefined;
};

const chatRouteDeps: ChatRouteDeps = { db: undefined, elizaClient: undefined };

export function __setAgentsChatRouteDepsForTest(deps: Partial<ChatRouteDeps>): void {
	chatRouteDeps.db = deps.db;
	chatRouteDeps.elizaClient = deps.elizaClient;
}

function requireDb(): Database | null {
	if (chatRouteDeps.db) return chatRouteDeps.db;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function getElizaClient(): Pick<ElizaCloudClient, "sendAgentMessage"> | null {
	if (chatRouteDeps.elizaClient) return chatRouteDeps.elizaClient;
	const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://api.elizacloud.ai";
	const serviceKey = process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY;
	const apiKey = resolveElizaCloudApiKey();
	if (!serviceKey && !apiKey) return null;
	return createElizaCloudClient({
		baseUrl,
		...(serviceKey ? { serviceKey } : {}),
		...(apiKey ? { apiKey } : {}),
		logger: console,
		resilient: true,
	});
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
	const raw = value[key];
	return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function isHostedRuntimeRunning(status: string | null | undefined): boolean {
	return ["running", "ready", "online", "active", "started"].includes(String(status ?? "").toLowerCase());
}

type RuntimeRefs = {
	cloudAgentId: string | null;
	webUiUrl: string | null;
	agentStatus: string | null;
	dormant: boolean;
	killed: boolean;
};

/**
 * Resolve the hosted-runtime references for a persona by its stable slug.
 *
 * The cloud agent id and web UI url live in the persona's provisioning
 * metadata; the runtime status (running / dormant) is mirrored onto the
 * `agents` overlay keyed by token address. We read both so the route can
 * answer "is this agent live, dormant, or not yet provisioned" honestly.
 */
async function resolveRuntimeRefs(db: Database, agentSlug: string): Promise<RuntimeRefs | null> {
	const [persona] = await db
		.select({
			metadata: agentPersonas.metadata,
			tokenAddress: agentPersonas.tokenAddress,
			dormantAt: agentPersonas.dormantAt,
			killedAt: agentPersonas.killedAt,
		})
		.from(agentPersonas)
		.where(eq(agentPersonas.agentId, agentSlug))
		.limit(1);
	if (!persona) return null;

	const provisioning = recordFromUnknown(recordFromUnknown(persona.metadata).provisioning);
	let cloudAgentId =
		stringField(provisioning, "cloudAgentId") ??
		stringField(provisioning, "runtimeAgentId") ??
		stringField(provisioning, "containerId");
	let webUiUrl = stringField(provisioning, "webUiUrl") ?? stringField(provisioning, "containerUrl");
	let agentStatus = stringField(provisioning, "status");

	if (persona.tokenAddress) {
		const [overlay] = await db
			.select({
				cloudAgentId: agents.cloudAgentId,
				webUiUrl: agents.webUiUrl,
				agentStatus: agents.agentStatus,
				tokenStatus: tokens.agentStatus,
			})
			.from(tokens)
			.leftJoin(agents, eq(agents.tokenId, tokens.id))
			.where(sql`lower(${tokens.contractAddress}) = lower(${persona.tokenAddress})`)
			.limit(1);
		if (overlay) {
			cloudAgentId = cloudAgentId ?? overlay.cloudAgentId ?? null;
			webUiUrl = webUiUrl ?? overlay.webUiUrl ?? null;
			agentStatus = overlay.agentStatus ?? overlay.tokenStatus ?? agentStatus;
		}
	}

	return {
		cloudAgentId,
		webUiUrl,
		agentStatus,
		dormant: persona.dormantAt !== null,
		killed: persona.killedAt !== null,
	};
}

/**
 * POST /v2/agents/:id/chat
 *
 * Patron-only chat with the hosted agent. waifu-core is the gateway: the
 * browser never reaches the container, every turn flows through this
 * patron-authed proxy (requirePatron + requireAgentOwnership), which forwards
 * to the Eliza Cloud runtime with the service key. This is the enforcement
 * point for "only the human patron can talk to the agent".
 *
 * Body: { text: string, sessionId?: string }
 */
app.post("/:id/chat", requirePatron(), requireAgentOwnership("id"), async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);

	const ownership = c.get("patronAgent");
	const patron = c.get("patron");
	const agentSlug = ownership.agentId;

	let body: { text?: unknown; sessionId?: unknown };
	try {
		body = (await c.req.json()) as { text?: unknown; sessionId?: unknown };
	} catch {
		return c.json({ ok: false, error: "BAD_REQUEST", message: "invalid JSON body" }, 400);
	}

	const text = typeof body.text === "string" ? body.text.trim() : "";
	if (!text) {
		return c.json({ ok: false, error: "EMPTY_MESSAGE", message: "message text is required" }, 400);
	}
	if (text.length > MAX_MESSAGE_CHARS) {
		return c.json(
			{
				ok: false,
				error: "MESSAGE_TOO_LONG",
				message: `keep it under ${MAX_MESSAGE_CHARS} chars`,
				max: MAX_MESSAGE_CHARS,
			},
			400,
		);
	}

	// One stable conversation per patron + agent so the runtime threads replies.
	const sessionId =
		typeof body.sessionId === "string" && body.sessionId.trim().length > 0
			? body.sessionId.trim()
			: `patron:${patron.id}:${ownership.id}`;

	const refs = await resolveRuntimeRefs(db, agentSlug);
	if (!refs) {
		return c.json(
			{ ok: false, error: "AGENT_NOT_FOUND", code: "AGENT_NOT_FOUND", message: `agent ${agentSlug} not found` },
			404,
		);
	}
	if (refs.killed) {
		return c.json(
			{ ok: false, error: "AGENT_KILLED", code: "AGENT_KILLED", message: "this agent is permanently killed" },
			409,
		);
	}
	if (!refs.cloudAgentId || !refs.webUiUrl) {
		// Token not bonded / provisioning: no runtime to talk to yet.
		return c.json(
			{
				ok: false,
				error: "AGENT_NOT_RUNNING",
				code: "AGENT_NOT_RUNNING",
				message: "your agent goes live when the token bonds",
				state: "provisioning",
			},
			409,
		);
	}
	if (refs.dormant || !isHostedRuntimeRunning(refs.agentStatus)) {
		return c.json(
			{
				ok: false,
				error: "AGENT_DORMANT",
				code: "AGENT_DORMANT",
				message: "agent is dormant. top up credits to wake it.",
				state: refs.dormant ? "dormant" : "provisioning",
				agentStatus: refs.agentStatus ?? null,
			},
			409,
		);
	}

	const client = getElizaClient();
	if (!client?.sendAgentMessage) {
		return c.json(
			{
				ok: false,
				error: "CHAT_NOT_CONFIGURED",
				code: "CHAT_NOT_CONFIGURED",
				message: "agent chat transport is not configured",
			},
			503,
		);
	}

	let reply: ElizaAgentMessageResult;
	try {
		reply = await client.sendAgentMessage({
			agentId: refs.cloudAgentId,
			text,
			sessionId,
			senderId: `patron:${patron.id}`,
		});
	} catch (err) {
		if (isElizaCloudUnavailable(err)) {
			return c.json(elizaUnavailableBody("ELIZA_CLOUD_UNAVAILABLE"), 503);
		}
		// ElizaApiError carries the upstream status; preserve 409 (e.g. killed/conflict)
		// as 409 rather than masking it as a transport failure. Everything else → 502.
		const status = err instanceof ElizaApiError && err.status === 409 ? 409 : 502;
		return c.json(
			{
				ok: false,
				error: "CHAT_FAILED",
				code: "CHAT_FAILED",
				message: err instanceof Error ? err.message : String(err),
			},
			status,
		);
	}

	return c.json({
		ok: true,
		sessionId: reply.sessionId,
		reply: reply.text,
		sentAt: new Date().toISOString(),
	});
});

export default app;
