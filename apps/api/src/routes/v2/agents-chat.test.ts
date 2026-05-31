import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../../middleware/patron-auth.js";
import type { ElizaAgentMessageInput, ElizaAgentMessageResult } from "../../services/eliza-client.js";
import agentChatRoutes, { __setAgentsChatRouteDepsForTest } from "./agents-chat.js";

// ─── Constants ──────────────────────────────────────────────────────
const STEWARD_USER_ID = "steward-owner-1";
const OTHER_STEWARD_USER_ID = "steward-stranger-9";
const PERSONA_UUID = "00000000-0000-4000-8000-000000000abc";
const AGENT_SLUG = "waifu-suki-001";

// ─── Patron-auth fake DB ────────────────────────────────────────────
// Models the two lookups requirePatron()/requireAgentOwnership() perform:
// patron_users by steward id, and agent_personas by id then agentId. We key
// off the predicate shape drizzle's eq() leaves behind only loosely, so we
// instead drive returns from injected state and the selected table kind.
type PersonaRow = {
	id: string;
	agentId: string;
	ownerStewardUserId: string | null;
	ownerAddress: string | null;
};

function fakePatronAuthDb(persona: PersonaRow | null, callerStewardId: string = STEWARD_USER_ID) {
	// Sequenced by call order to match the middleware flow without depending on
	// drizzle's internal table-name symbol: select #1 is the patron_users
	// lookup in requirePatron(); select #2 is the agent_personas-by-id lookup in
	// requireAgentOwnership() (the by-agentId fallback only fires if #2 misses).
	// The patron row carries the caller's steward id so ownership checks reflect
	// who is actually authenticated.
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

// ─── Chat-route fake DB ─────────────────────────────────────────────
// resolveRuntimeRefs() does: select persona by agentId (limit 1), then if
// tokenAddress is set, a tokens leftJoin agents (limit 1). We sequence the two
// selects by call order.
type RuntimeFixture = {
	persona: {
		metadata: unknown;
		tokenAddress: string | null;
		dormantAt: Date | null;
		killedAt: Date | null;
	} | null;
	overlay: {
		cloudAgentId: string | null;
		webUiUrl: string | null;
		agentStatus: string | null;
		tokenStatus: string | null;
	} | null;
};

function fakeChatDb(fixture: RuntimeFixture) {
	let call = 0;
	function builder() {
		const current = call;
		call += 1;
		const b = {
			from() {
				return b;
			},
			leftJoin() {
				return b;
			},
			where() {
				return b;
			},
			limit() {
				if (current === 0) return Promise.resolve(fixture.persona ? [fixture.persona] : []);
				return Promise.resolve(fixture.overlay ? [fixture.overlay] : []);
			},
		};
		return b;
	}
	return { select: () => builder() } as never;
}

function ownerParser(): StewardParser {
	return (async () => ({ userId: STEWARD_USER_ID, email: null })) as unknown as StewardParser;
}
function strangerParser(): StewardParser {
	return (async () => ({ userId: OTHER_STEWARD_USER_ID, email: null })) as unknown as StewardParser;
}

function makeApp() {
	const app = new Hono();
	app.route("/v2/agents", agentChatRoutes);
	return app;
}

function post(app: Hono, body: unknown, token = "owner-token") {
	return app.request(`http://x/v2/agents/${PERSONA_UUID}/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
		body: JSON.stringify(body),
	});
}

const runningPersona: RuntimeFixture = {
	persona: {
		metadata: {
			provisioning: { cloudAgentId: "cloud-suki-1", webUiUrl: "https://chat.example/suki", status: "running" },
		},
		tokenAddress: null,
		dormantAt: null,
		killedAt: null,
	},
	overlay: null,
};

describe("POST /v2/agents/:id/chat", () => {
	afterEach(() => {
		__setRequirePatronDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
		__setAgentsChatRouteDepsForTest({ db: undefined, elizaClient: undefined });
	});

	it("403s a non-owner patron (only the patron can talk)", async () => {
		__setRequirePatronStewardParserForTest(strangerParser());
		__setRequirePatronDbForTest(
			fakePatronAuthDb(
				{
					id: PERSONA_UUID,
					agentId: AGENT_SLUG,
					ownerStewardUserId: STEWARD_USER_ID,
					ownerAddress: null,
				},
				OTHER_STEWARD_USER_ID,
			),
		);
		__setAgentsChatRouteDepsForTest({
			db: fakeChatDb(runningPersona),
			elizaClient: { sendAgentMessage: async () => unreachable() },
		});

		const res = await post(makeApp(), { text: "hello" }, "stranger-token");
		assert.equal(res.status, 403);
	});

	it("401s when no bearer is presented", async () => {
		__setRequirePatronStewardParserForTest(ownerParser());
		__setRequirePatronDbForTest(
			fakePatronAuthDb({
				id: PERSONA_UUID,
				agentId: AGENT_SLUG,
				ownerStewardUserId: STEWARD_USER_ID,
				ownerAddress: null,
			}),
		);
		const res = await makeApp().request(`http://x/v2/agents/${PERSONA_UUID}/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: "hi" }),
		});
		assert.equal(res.status, 401);
	});

	it("400s on empty message text", async () => {
		__setRequirePatronStewardParserForTest(ownerParser());
		__setRequirePatronDbForTest(
			fakePatronAuthDb({
				id: PERSONA_UUID,
				agentId: AGENT_SLUG,
				ownerStewardUserId: STEWARD_USER_ID,
				ownerAddress: null,
			}),
		);
		__setAgentsChatRouteDepsForTest({
			db: fakeChatDb(runningPersona),
			elizaClient: { sendAgentMessage: async () => unreachable() },
		});
		const res = await post(makeApp(), { text: "   " });
		assert.equal(res.status, 400);
	});

	it("409s with provisioning state when no runtime is bonded yet", async () => {
		__setRequirePatronStewardParserForTest(ownerParser());
		__setRequirePatronDbForTest(
			fakePatronAuthDb({
				id: PERSONA_UUID,
				agentId: AGENT_SLUG,
				ownerStewardUserId: STEWARD_USER_ID,
				ownerAddress: null,
			}),
		);
		__setAgentsChatRouteDepsForTest({
			db: fakeChatDb({
				persona: { metadata: {}, tokenAddress: null, dormantAt: null, killedAt: null },
				overlay: null,
			}),
			elizaClient: { sendAgentMessage: async () => unreachable() },
		});
		const res = await post(makeApp(), { text: "hi" });
		assert.equal(res.status, 409);
		const json = (await res.json()) as { error: string; state: string };
		assert.equal(json.error, "AGENT_NOT_RUNNING");
		assert.equal(json.state, "provisioning");
	});

	it("409s with dormant state when the agent is dormant", async () => {
		__setRequirePatronStewardParserForTest(ownerParser());
		__setRequirePatronDbForTest(
			fakePatronAuthDb({
				id: PERSONA_UUID,
				agentId: AGENT_SLUG,
				ownerStewardUserId: STEWARD_USER_ID,
				ownerAddress: null,
			}),
		);
		__setAgentsChatRouteDepsForTest({
			db: fakeChatDb({
				persona: {
					metadata: {
						provisioning: { cloudAgentId: "cloud-1", webUiUrl: "https://chat.example/x", status: "running" },
					},
					tokenAddress: null,
					dormantAt: new Date(),
					killedAt: null,
				},
				overlay: null,
			}),
			elizaClient: { sendAgentMessage: async () => unreachable() },
		});
		const res = await post(makeApp(), { text: "hi" });
		assert.equal(res.status, 409);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "AGENT_DORMANT");
	});

	it("forwards to the runtime and returns the reply for the owner", async () => {
		__setRequirePatronStewardParserForTest(ownerParser());
		__setRequirePatronDbForTest(
			fakePatronAuthDb({
				id: PERSONA_UUID,
				agentId: AGENT_SLUG,
				ownerStewardUserId: STEWARD_USER_ID,
				ownerAddress: null,
			}),
		);
		const seen: ElizaAgentMessageInput[] = [];
		__setAgentsChatRouteDepsForTest({
			db: fakeChatDb(runningPersona),
			elizaClient: {
				async sendAgentMessage(input: ElizaAgentMessageInput): Promise<ElizaAgentMessageResult> {
					seen.push(input);
					return { text: "gm patron", sessionId: input.sessionId, raw: {} };
				},
			},
		});
		const res = await post(makeApp(), { text: "gm" });
		assert.equal(res.status, 200);
		const json = (await res.json()) as { ok: boolean; reply: string; sessionId: string };
		assert.equal(json.ok, true);
		assert.equal(json.reply, "gm patron");
		assert.equal(seen.length, 1);
		assert.equal(seen[0]?.agentId, "cloud-suki-1");
		assert.equal(seen[0]?.text, "gm");
	});

	it("502s when the runtime call throws", async () => {
		__setRequirePatronStewardParserForTest(ownerParser());
		__setRequirePatronDbForTest(
			fakePatronAuthDb({
				id: PERSONA_UUID,
				agentId: AGENT_SLUG,
				ownerStewardUserId: STEWARD_USER_ID,
				ownerAddress: null,
			}),
		);
		__setAgentsChatRouteDepsForTest({
			db: fakeChatDb(runningPersona),
			elizaClient: {
				async sendAgentMessage(): Promise<ElizaAgentMessageResult> {
					throw new Error("runtime down");
				},
			},
		});
		const res = await post(makeApp(), { text: "hi" });
		assert.equal(res.status, 502);
		const json = (await res.json()) as { error: string };
		assert.equal(json.error, "CHAT_FAILED");
	});
});

function unreachable(): never {
	throw new Error("eliza client should not be called in this case");
}
