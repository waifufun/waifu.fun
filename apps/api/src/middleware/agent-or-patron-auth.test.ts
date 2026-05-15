import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	type RequireAgentOrPatronBindings,
	__setAgentOrPatronDbForTest,
	requireAgentOrPatron,
} from "./agent-or-patron-auth.js";
import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "./patron-auth.js";

// ─── Test doubles ──────────────────────────────────────────────────

type AgentRow = {
	id: string;
	agentId: string;
	ownerStewardUserId: string | null;
	ownerAddress: string | null;
};
type AgentKeyRow = {
	id: string;
	agentId: string;
	scopes: string[];
};
type PatronRow = {
	id: string;
	stewardUserId: string | null;
	primaryEmail: string | null;
};

const VALID_AGK = "agk_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const MALFORMED_AGK = "agk_not_hex";
const STEWARD_USER_ID = "steward-owner-1";
const PATRON_ID = "patron-1";
const AGENT_ID = "agt_demo";
const KEY_ID = "key-1";
const OWNER_ADDR = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";

function readDrizzleTableName(t: unknown): string | null {
	if (!t || typeof t !== "object") return null;
	const sym = Object.getOwnPropertySymbols(t).find((s) => s.description === "drizzle:Name");
	if (!sym) return null;
	const value = (t as Record<symbol, unknown>)[sym];
	return typeof value === "string" ? value : null;
}

interface FakeDbOpts {
	agentKey?: AgentKeyRow | null;
	agent?: AgentRow | null;
	patron?: PatronRow | null;
	updates?: Array<{ table: string; values: Record<string, unknown> }>;
}

function fakeDb(opts: FakeDbOpts) {
	const updates = opts.updates ?? [];
	return {
		select(_cols?: unknown) {
			let table: string | null = null;
			const builder = {
				from(t: unknown) {
					table = readDrizzleTableName(t);
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					if (table === "agent_api_keys") {
						return Promise.resolve(opts.agentKey ? [opts.agentKey] : []);
					}
					if (table === "agent_personas") {
						return Promise.resolve(opts.agent ? [opts.agent] : []);
					}
					if (table === "patron_users") {
						return Promise.resolve(opts.patron ? [opts.patron] : []);
					}
					return Promise.resolve([]);
				},
			};
			return builder;
		},
		update(t: unknown) {
			const tableName = readDrizzleTableName(t) ?? "unknown";
			return {
				set(values: Record<string, unknown>) {
					return {
						where() {
							updates.push({ table: tableName, values });
							return Promise.resolve();
						},
					};
				},
			};
		},
		insert() {
			return {
				values() {
					return { returning: () => Promise.resolve([opts.patron]) };
				},
			};
		},
	} as never;
}

function makeApp() {
	const app = new Hono<RequireAgentOrPatronBindings>();
	app.use("*", requireAgentOrPatron());
	app.get("/me", (c) => c.json({ patron: c.get("patron"), authMode: c.get("authMode") }));
	return app;
}

afterEach(() => {
	__setAgentOrPatronDbForTest(undefined);
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
});

// ─── Patron path ───────────────────────────────────────────────────

describe("requireAgentOrPatron — patron path", () => {
	it("accepts a valid Steward JWT and sets authMode='patron'", async () => {
		__setRequirePatronStewardParserForTest((async () => ({
			userId: STEWARD_USER_ID,
			tenantId: "waifu",
			email: "p@x.com",
		})) as StewardParser);
		__setRequirePatronDbForTest(
			fakeDb({
				patron: { id: PATRON_ID, stewardUserId: STEWARD_USER_ID, primaryEmail: "p@x.com" },
			}),
		);

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: "Bearer steward-jwt" },
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as { patron: { id: string; stewardUserId: string }; authMode: string };
		assert.equal(body.authMode, "patron");
		assert.equal(body.patron.id, PATRON_ID);
		assert.equal(body.patron.stewardUserId, STEWARD_USER_ID);
	});

	it("401s when the Steward JWT is invalid", async () => {
		__setRequirePatronStewardParserForTest((async () => null) as StewardParser);
		__setRequirePatronDbForTest(fakeDb({}));

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: "Bearer bogus-jwt" },
		});
		assert.equal(res.status, 401);
	});

	it("401s when no auth headers are present at all", async () => {
		__setRequirePatronDbForTest(fakeDb({}));
		const res = await makeApp().request("http://x/me");
		assert.equal(res.status, 401);
	});
});

// ─── Agent path ────────────────────────────────────────────────────

describe("requireAgentOrPatron — agent path", () => {
	it("accepts a valid agk_ key and sets authMode='agent' with owner-patron context", async () => {
		__setAgentOrPatronDbForTest(
			fakeDb({
				agentKey: { id: KEY_ID, agentId: AGENT_ID, scopes: ["launch:*"] },
				agent: {
					id: "persona-uuid",
					agentId: AGENT_ID,
					ownerStewardUserId: STEWARD_USER_ID,
					ownerAddress: OWNER_ADDR,
				},
				patron: { id: PATRON_ID, stewardUserId: STEWARD_USER_ID, primaryEmail: "owner@x.com" },
			}),
		);

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: `Bearer ${VALID_AGK}` },
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as {
			patron: { id: string; stewardUserId: string; primaryAddress: string | null };
			authMode: string;
		};
		assert.equal(body.authMode, "agent");
		assert.equal(body.patron.id, PATRON_ID);
		assert.equal(body.patron.stewardUserId, STEWARD_USER_ID);
		assert.equal(body.patron.primaryAddress, OWNER_ADDR.toLowerCase());
	});

	it("403s when the agent has no owner_steward_user_id", async () => {
		__setAgentOrPatronDbForTest(
			fakeDb({
				agentKey: { id: KEY_ID, agentId: AGENT_ID, scopes: ["launch:*"] },
				agent: {
					id: "persona-uuid",
					agentId: AGENT_ID,
					ownerStewardUserId: null,
					ownerAddress: OWNER_ADDR,
				},
			}),
		);

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: `Bearer ${VALID_AGK}` },
		});
		assert.equal(res.status, 403);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "AGENT_OWNER_PATRON_NOT_FOUND");
	});

	it("403s when owner steward exists but no patron row matches", async () => {
		__setAgentOrPatronDbForTest(
			fakeDb({
				agentKey: { id: KEY_ID, agentId: AGENT_ID, scopes: ["launch:*"] },
				agent: {
					id: "persona-uuid",
					agentId: AGENT_ID,
					ownerStewardUserId: STEWARD_USER_ID,
					ownerAddress: null,
				},
				patron: null,
			}),
		);

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: `Bearer ${VALID_AGK}` },
		});
		assert.equal(res.status, 403);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "AGENT_OWNER_PATRON_NOT_FOUND");
	});

	it("401s when the agk_ key is malformed", async () => {
		__setAgentOrPatronDbForTest(fakeDb({ agentKey: null }));

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: `Bearer ${MALFORMED_AGK}` },
		});
		assert.equal(res.status, 401);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "AGENT_AUTH_INVALID");
	});

	it("401s when the agk_ key is well-formed but unknown / revoked", async () => {
		__setAgentOrPatronDbForTest(fakeDb({ agentKey: null }));

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: `Bearer ${VALID_AGK}` },
		});
		assert.equal(res.status, 401);
	});

	it("accepts the X-Agent-Api-Key header as an alternative to Bearer", async () => {
		__setAgentOrPatronDbForTest(
			fakeDb({
				agentKey: { id: KEY_ID, agentId: AGENT_ID, scopes: ["launch:*"] },
				agent: {
					id: "persona-uuid",
					agentId: AGENT_ID,
					ownerStewardUserId: STEWARD_USER_ID,
					ownerAddress: OWNER_ADDR,
				},
				patron: { id: PATRON_ID, stewardUserId: STEWARD_USER_ID, primaryEmail: null },
			}),
		);

		const res = await makeApp().request("http://x/me", {
			headers: { "x-agent-api-key": VALID_AGK },
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as { authMode: string };
		assert.equal(body.authMode, "agent");
	});
});

// ─── Precedence ────────────────────────────────────────────────────

describe("requireAgentOrPatron — precedence", () => {
	it("when both agk_ bearer and steward parser would succeed, agent path wins", async () => {
		// This test confirms behaviour: bearer starts with `agk_` → agent path
		// is attempted first. A separate Steward JWT would have to come via the
		// X-Agent-Api-Key absence + a non-`agk_` bearer; we cannot send two
		// Authorization headers, so the documented precedence is: if Bearer
		// looks like agk_, the agent path runs. We assert that here.
		__setRequirePatronStewardParserForTest((async () => {
			throw new Error("steward parser must not be called when bearer is agk_");
		}) as StewardParser);
		__setAgentOrPatronDbForTest(
			fakeDb({
				agentKey: { id: KEY_ID, agentId: AGENT_ID, scopes: ["launch:*"] },
				agent: {
					id: "persona-uuid",
					agentId: AGENT_ID,
					ownerStewardUserId: STEWARD_USER_ID,
					ownerAddress: OWNER_ADDR,
				},
				patron: { id: PATRON_ID, stewardUserId: STEWARD_USER_ID, primaryEmail: null },
			}),
		);

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: `Bearer ${VALID_AGK}` },
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as { authMode: string };
		assert.equal(body.authMode, "agent");
	});
});
