import { agentEventQueries, agentPersonas, getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";

import { constantTimeEqual } from "../../lib/agent-keys.js";
import type { AppBindings } from "../../lib/bindings.js";

const app = new Hono<AppBindings>();

type Db = ReturnType<typeof getDatabase>["db"];
type AdminAgentContext = Context<AppBindings>;
type PauseScope = "brain" | "withdrawals" | "full";

type AgentControlState = {
	agentId: string;
	brainPausedAt: Date | null;
	brainPausedReason: string | null;
	withdrawalsPausedAt: Date | null;
	withdrawalsPausedReason: string | null;
	killedAt: Date | null;
	killedReason: string | null;
};

let testDbOverride: Db | null | undefined;

export function __setAdminAgentsDbForTest(db: Db | null | undefined) {
	testDbOverride = db;
}

function requireDrizzle(): Db | null {
	if (testDbOverride !== undefined) return testDbOverride;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function formatTimestamp(value: Date | null): string | null {
	return value ? value.toISOString() : null;
}

function serializeState(state: AgentControlState) {
	return {
		agentId: state.agentId,
		brainPaused: state.brainPausedAt !== null,
		brainPausedAt: formatTimestamp(state.brainPausedAt),
		brainPausedReason: state.brainPausedReason,
		withdrawalsPaused: state.withdrawalsPausedAt !== null,
		withdrawalsPausedAt: formatTimestamp(state.withdrawalsPausedAt),
		withdrawalsPausedReason: state.withdrawalsPausedReason,
		killed: state.killedAt !== null,
		killedAt: formatTimestamp(state.killedAt),
		killedReason: state.killedReason,
	};
}

async function readState(db: Db, agentId: string): Promise<AgentControlState | null> {
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

async function emitAgentEvent(db: Db, agentId: string, type: string, payload: Record<string, unknown>) {
	await agentEventQueries.enqueueAgentEvent(db, {
		agentId,
		type,
		payload,
	});
}

async function parseReason(c: AdminAgentContext) {
	if (c.req.header("content-length") === "0") return null;

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return null;
	}

	if (!body || typeof body !== "object" || Array.isArray(body)) return null;
	const reason = (body as { reason?: unknown }).reason;
	if (typeof reason !== "string") return null;
	const trimmed = reason.trim();
	return trimmed.length > 0 ? trimmed : null;
}

// OK: mounted exclusively at /v2/admin/agents. Do not mount this router on /v2/agents.
app.use("*", async (c, next) => {
	const authHeader = c.req.header("authorization");
	if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
		return c.json({ ok: false, error: "UNAUTHORIZED", message: "Admin bearer token required" }, 401);
	}

	const expected = process.env.ADMIN_API_KEY;
	const got = authHeader.slice(7).trim();
	if (!expected || expected.length === 0 || !constantTimeEqual(got, expected)) {
		return c.json({ ok: false, error: "FORBIDDEN", message: "Invalid admin bearer token" }, 403);
	}

	await next();
});

async function requireLiveAgent(db: Db, agentId: string) {
	const state = await readState(db, agentId);
	if (!state) return { response: new Response(null, { status: 404 }), state: null } as const;
	if (state.killedAt) return { response: new Response(null, { status: 409 }), state } as const;
	return { response: null, state } as const;
}

function notFoundResponse(agentId: string) {
	return Response.json({ ok: false, error: "AGENT_NOT_FOUND", message: `agent ${agentId} not found` }, { status: 404 });
}

function killedResponse(agentId: string) {
	return Response.json(
		{ ok: false, error: "AGENT_KILLED", message: `agent ${agentId} is permanently killed` },
		{ status: 409 },
	);
}

async function pauseScopes(db: Db, agentId: string, scopes: PauseScope[], reason: string | null) {
	const now = new Date();
	const set: Partial<typeof agentPersonas.$inferInsert> = { updatedAt: now };

	if (scopes.includes("brain") || scopes.includes("full")) {
		set.brainPausedAt = now;
		set.brainPausedReason = reason;
	}
	if (scopes.includes("withdrawals") || scopes.includes("full")) {
		set.withdrawalsPausedAt = now;
		set.withdrawalsPausedReason = reason;
	}

	const [row] = await db.update(agentPersonas).set(set).where(eq(agentPersonas.agentId, agentId)).returning({
		agentId: agentPersonas.agentId,
		brainPausedAt: agentPersonas.brainPausedAt,
		brainPausedReason: agentPersonas.brainPausedReason,
		withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
		withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
		killedAt: agentPersonas.killedAt,
		killedReason: agentPersonas.killedReason,
	});

	if (!row) return null;

	const scope: PauseScope = scopes.includes("full") ? "full" : (scopes[0] ?? "full");
	await emitAgentEvent(db, agentId, "agent.paused", { scope, reason });
	return row;
}

async function resumeScopes(db: Db, agentId: string, scopes: PauseScope[]) {
	const set: Partial<typeof agentPersonas.$inferInsert> = { updatedAt: new Date() };

	if (scopes.includes("brain") || scopes.includes("full")) {
		set.brainPausedAt = null;
		set.brainPausedReason = null;
	}
	if (scopes.includes("withdrawals") || scopes.includes("full")) {
		set.withdrawalsPausedAt = null;
		set.withdrawalsPausedReason = null;
	}

	const [row] = await db.update(agentPersonas).set(set).where(eq(agentPersonas.agentId, agentId)).returning({
		agentId: agentPersonas.agentId,
		brainPausedAt: agentPersonas.brainPausedAt,
		brainPausedReason: agentPersonas.brainPausedReason,
		withdrawalsPausedAt: agentPersonas.withdrawalsPausedAt,
		withdrawalsPausedReason: agentPersonas.withdrawalsPausedReason,
		killedAt: agentPersonas.killedAt,
		killedReason: agentPersonas.killedReason,
	});

	if (!row) return null;

	const scope: PauseScope = scopes.includes("full") ? "full" : (scopes[0] ?? "full");
	await emitAgentEvent(db, agentId, "agent.resumed", { scope });
	return row;
}

async function withDb(c: AdminAgentContext) {
	const db = requireDrizzle();
	if (!db) {
		return { db: null, response: c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503) };
	}
	return { db, response: null };
}

app.post("/:agentId/brain/pause", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const reason = await parseReason(c);
	const state = await pauseScopes(db, agentId, ["brain"], reason);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/brain/resume", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const state = await resumeScopes(db, agentId, ["brain"]);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/withdrawals/pause", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const reason = await parseReason(c);
	const state = await pauseScopes(db, agentId, ["withdrawals"], reason);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/withdrawals/resume", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const state = await resumeScopes(db, agentId, ["withdrawals"]);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/pause", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const reason = await parseReason(c);
	const state = await pauseScopes(db, agentId, ["full"], reason);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/resume", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const live = await requireLiveAgent(db, agentId);
	if (!live.state) return notFoundResponse(agentId);
	if (live.response) return killedResponse(agentId);
	const state = await resumeScopes(db, agentId, ["full"]);
	return c.json({ ok: true, data: serializeState(state ?? live.state) });
});

app.post("/:agentId/kill", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const existing = await readState(db, agentId);
	if (!existing) return notFoundResponse(agentId);
	if (existing.killedAt) {
		return c.json({ ok: false, error: "AGENT_ALREADY_KILLED", message: `agent ${agentId} is already killed` }, 409);
	}

	const reason = await parseReason(c);
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

	await emitAgentEvent(db, agentId, "agent.killed", { reason });
	return c.json({ ok: true, data: serializeState(state ?? existing) });
});

app.get("/:agentId/state", async (c) => {
	const agentId = c.req.param("agentId");
	const { db, response } = await withDb(c);
	if (!db) return response;
	const state = await readState(db, agentId);
	if (!state) return notFoundResponse(agentId);
	return c.json({ ok: true, data: serializeState(state) });
});

export default app;
