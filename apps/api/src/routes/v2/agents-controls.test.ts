import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../../middleware/patron-auth.js";
import type { emitAgentEvent } from "../../services/events/emit.js";
import agentRoutes, { __setAgentsRouteDepsForTest } from "./agents.js";

// No-op event emitter so control-route tests don't reach the real events
// service (which needs a live DB). Captures the last emitted event so tests can
// assert the right lifecycle event fired.
type EmittedEvent = { agentId: string; eventType: string; data?: unknown };
function fakeEmit(sink: { last?: EmittedEvent }): typeof emitAgentEvent {
	return (async (input: EmittedEvent) => {
		sink.last = input;
		return { id: "evt-1", ...input } as unknown;
	}) as unknown as typeof emitAgentEvent;
}

// ─── Constants ──────────────────────────────────────────────────────
const STEWARD_USER_ID = "steward-owner-1";
const OTHER_STEWARD_USER_ID = "steward-stranger-9";
const PERSONA_UUID = "00000000-0000-4000-8000-000000000abc";
const AGENT_SLUG = "waifu-suki-001";

// ─── Patron-auth fake DB ────────────────────────────────────────────
// Mirrors agents-chat.test.ts / agents-trading-policy.test.ts: select #1 is
// the patron_users lookup in requirePatron(); select #2 is the
// agent_personas-by-id lookup in requireAgentOwnership().
type PersonaRow = {
	id: string;
	agentId: string;
	ownerStewardUserId: string | null;
	ownerAddress: string | null;
};

const OWNED_PERSONA: PersonaRow = {
	id: PERSONA_UUID,
	agentId: AGENT_SLUG,
	ownerStewardUserId: STEWARD_USER_ID,
	ownerAddress: null,
};

function fakePatronAuthDb(persona: PersonaRow | null, callerStewardId: string = STEWARD_USER_ID) {
	const patronRow = {
		id: "patron-row-1",
		stewardUserId: callerStewardId,
		primaryEmail: null,
		xUserId: `steward:${callerStewardId}`,
		xHandle: `steward:${callerStewardId}`,
	};
	let call = 0;
	function builder() {
		const current = call;
		call += 1;
		const b = {
			from() {
				return b;
			},
			where() {
				return b;
			},
			limit() {
				if (current === 0) return Promise.resolve([patronRow]);
				return Promise.resolve(persona ? [persona] : []);
			},
		};
		return b;
	}
	return { select: () => builder() } as never;
}

// ─── Control-route fake DB ──────────────────────────────────────────
// The pause/kill/resume handlers do exactly two DB ops:
//   1. readControlState(): select(...).from(agentPersonas).where(...).limit(1)
//   2. db.update(...).set(...).where(...).returning(...)
// We capture the `set(...)` payload so tests can assert the columns written.
type ControlRow = {
	agentId: string;
	brainPausedAt: Date | null;
	brainPausedReason: string | null;
	withdrawalsPausedAt: Date | null;
	withdrawalsPausedReason: string | null;
	killedAt: Date | null;
	killedReason: string | null;
};

type ControlDbState = {
	row: ControlRow | null;
	lastSet?: Record<string, unknown>;
};

function fakeControlDb(state: ControlDbState) {
	return {
		select() {
			const b = {
				from() {
					return b;
				},
				where() {
					return b;
				},
				limit() {
					return Promise.resolve(state.row ? [state.row] : []);
				},
			};
			return b;
		},
		update() {
			const b = {
				set(values: Record<string, unknown>) {
					state.lastSet = values;
					// Apply the mutation to the in-memory row so `returning()`
					// reflects the post-update state, matching real drizzle.
					if (state.row) {
						state.row = { ...state.row, ...(values as Partial<ControlRow>) };
					}
					return b;
				},
				where() {
					return b;
				},
				returning() {
					return Promise.resolve(state.row ? [state.row] : []);
				},
			};
			return b;
		},
	} as never;
}

function ownerParser(): StewardParser {
	return (async () => ({ userId: STEWARD_USER_ID, email: null })) as unknown as StewardParser;
}
function strangerParser(): StewardParser {
	return (async () => ({ userId: OTHER_STEWARD_USER_ID, email: null })) as unknown as StewardParser;
}

function makeApp() {
	const app = new Hono();
	app.route("/v2/agents", agentRoutes);
	return app;
}

function post(app: Hono, suffix: string, body?: unknown, token = "owner-token") {
	return app.request(`http://x/v2/agents/${PERSONA_UUID}/${suffix}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});
}

function activeRow(): ControlRow {
	return {
		agentId: AGENT_SLUG,
		brainPausedAt: null,
		brainPausedReason: null,
		withdrawalsPausedAt: null,
		withdrawalsPausedReason: null,
		killedAt: null,
		killedReason: null,
	};
}

function pausedRow(): ControlRow {
	const now = new Date("2026-01-01T00:00:00.000Z");
	return {
		agentId: AGENT_SLUG,
		brainPausedAt: now,
		brainPausedReason: "manual",
		withdrawalsPausedAt: now,
		withdrawalsPausedReason: "manual",
		killedAt: null,
		killedReason: null,
	};
}

function killedRow(): ControlRow {
	const now = new Date("2026-01-01T00:00:00.000Z");
	return {
		agentId: AGENT_SLUG,
		brainPausedAt: now,
		brainPausedReason: "rug",
		withdrawalsPausedAt: now,
		withdrawalsPausedReason: "rug",
		killedAt: now,
		killedReason: "rug",
	};
}

describe("patron emergency controls (pause / kill / resume)", () => {
	afterEach(() => {
		__setRequirePatronDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setAgentsRouteDepsForTest({});
	});

	// ─── auth ──────────────────────────────────────────────────────
	it("rejects an unauthenticated caller with 401 on pause", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest((async () => null) as unknown as StewardParser);
		__setAgentsRouteDepsForTest({ db: fakeControlDb({ row: activeRow() }) });
		const res = await makeApp().request(`http://x/v2/agents/${PERSONA_UUID}/pause`, { method: "POST" });
		assert.equal(res.status, 401);
	});

	it("rejects a non-owner patron with 403 on kill", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA, OTHER_STEWARD_USER_ID));
		__setRequirePatronStewardParserForTest(strangerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb({ row: activeRow() }) });
		const res = await post(makeApp(), "kill", { reason: "x" });
		assert.equal(res.status, 403);
	});

	// ─── pause ─────────────────────────────────────────────────────
	it("pause sets brain + withdrawals paused and echoes state", async () => {
		const dbState: ControlDbState = { row: activeRow() };
		const events: { last?: EmittedEvent } = {};
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb(dbState), emitAgentEvent: fakeEmit(events) });

		const res = await post(makeApp(), "pause", { reason: "investigating" });
		assert.equal(res.status, 200);
		const json = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
		assert.equal(json.ok, true);
		assert.equal(json.data.brainPaused, true);
		assert.equal(json.data.withdrawalsPaused, true);
		assert.equal(json.data.killed, false);
		// columns actually written
		assert.ok(dbState.lastSet?.brainPausedAt instanceof Date);
		assert.ok(dbState.lastSet?.withdrawalsPausedAt instanceof Date);
		assert.equal(dbState.lastSet?.brainPausedReason, "investigating");
		assert.equal(events.last?.eventType, "agent.paused");
	});

	it("pause refuses a killed agent with 409", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb({ row: killedRow() }) });
		const res = await post(makeApp(), "pause", { reason: "late" });
		assert.equal(res.status, 409);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "AGENT_KILLED");
	});

	// ─── kill ──────────────────────────────────────────────────────
	it("kill sets killedAt + pauses, echoes killed state", async () => {
		const dbState: ControlDbState = { row: activeRow() };
		const events: { last?: EmittedEvent } = {};
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb(dbState), emitAgentEvent: fakeEmit(events) });

		const res = await post(makeApp(), "kill", { reason: "rug" });
		assert.equal(res.status, 200);
		const json = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
		assert.equal(json.ok, true);
		assert.equal(json.data.killed, true);
		assert.equal(json.data.brainPaused, true);
		assert.ok(dbState.lastSet?.killedAt instanceof Date);
		assert.equal(dbState.lastSet?.killedReason, "rug");
		assert.equal(events.last?.eventType, "agent.killed");
	});

	it("kill refuses an already-killed agent with 409", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb({ row: killedRow() }) });
		const res = await post(makeApp(), "kill", { reason: "again" });
		assert.equal(res.status, 409);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "AGENT_ALREADY_KILLED");
	});

	// ─── resume ────────────────────────────────────────────────────
	it("resume clears brain + withdrawals pause and echoes active state", async () => {
		const dbState: ControlDbState = { row: pausedRow() };
		const events: { last?: EmittedEvent } = {};
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb(dbState), emitAgentEvent: fakeEmit(events) });

		const res = await post(makeApp(), "resume");
		assert.equal(res.status, 200);
		const json = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
		assert.equal(json.ok, true);
		assert.equal(json.data.brainPaused, false);
		assert.equal(json.data.withdrawalsPaused, false);
		assert.equal(json.data.killed, false);
		// columns actually nulled
		assert.equal(dbState.lastSet?.brainPausedAt, null);
		assert.equal(dbState.lastSet?.withdrawalsPausedAt, null);
		assert.equal(dbState.lastSet?.brainPausedReason, null);
		assert.equal(events.last?.eventType, "agent.resumed");
	});

	it("resume refuses a killed agent with 409 (kill is permanent)", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb({ row: killedRow() }) });
		const res = await post(makeApp(), "resume");
		assert.equal(res.status, 409);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "AGENT_KILLED");
	});

	// ─── honesty: event emission must never fail a committed mutation ──
	it("resume still returns 200 if the lifecycle-event emit throws (state already committed)", async () => {
		const dbState: ControlDbState = { row: pausedRow() };
		const throwingEmit = (async () => {
			throw new Error("events service down");
		}) as unknown as typeof emitAgentEvent;
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb(dbState), emitAgentEvent: throwingEmit });

		const res = await post(makeApp(), "resume");
		// The DB pause was cleared; a downstream notification failure must NOT
		// make the patron UI think the resume failed.
		assert.equal(res.status, 200);
		const json = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
		assert.equal(json.ok, true);
		assert.equal(json.data.brainPaused, false);
		assert.equal(dbState.lastSet?.brainPausedAt, null);
	});

	it("resume 404s when the agent persona is missing from the control table", async () => {
		__setRequirePatronDbForTest(fakePatronAuthDb(OWNED_PERSONA));
		__setRequirePatronStewardParserForTest(ownerParser());
		__setAgentsRouteDepsForTest({ db: fakeControlDb({ row: null }) });
		const res = await post(makeApp(), "resume");
		assert.equal(res.status, 404);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "AGENT_NOT_FOUND");
	});
});
