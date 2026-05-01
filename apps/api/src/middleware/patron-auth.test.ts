import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import {
	type AgentOwnershipContext,
	type PatronContext,
	type RequireAgentOwnershipBindings,
	type RequirePatronBindings,
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
	failFastIfMisconfigured,
	requireAgentOwnership,
	requirePatron,
} from "./patron-auth.js";

// ─── Test doubles ──────────────────────────────────────────────────

type PatronRow = {
	id: string;
	stewardUserId: string | null;
	primaryEmail: string | null;
	xUserId?: string | undefined;
	xHandle?: string | undefined;
};

type AgentRow = {
	id: string;
	ownerStewardUserId: string | null;
	ownerAddress: string | null;
};

interface FakeDbState {
	patronByStewardId: Map<string, PatronRow>;
	agentById: Map<string, AgentRow>;
	inserts: Array<Record<string, unknown>>;
}

function makeDb(state: FakeDbState) {
	// Each call to `select()` opens a new builder. The builder method that
	// determines what is returned (`limit`) needs access to which table was
	// selected from and what predicate was attached.
	function selectBuilder() {
		let table: "patronUsers" | "agentPersonas" | null = null;
		let stewardLookup: string | null = null;
		let agentLookup: string | null = null;

		const builder = {
			from(t: unknown) {
				if (t && typeof t === "object" && "_kind" in t) {
					table = (t as { _kind: "patronUsers" | "agentPersonas" })._kind;
				}
				return builder;
			},
			where(predicate: unknown) {
				const p = predicate as { _column?: string; _value?: string };
				if (p?._column === "stewardUserId") stewardLookup = p._value ?? null;
				if (p?._column === "agentId") agentLookup = p._value ?? null;
				return builder;
			},
			limit(_n: number) {
				if (table === "patronUsers" && stewardLookup) {
					const row = state.patronByStewardId.get(stewardLookup);
					return Promise.resolve(row ? [row] : []);
				}
				if (table === "agentPersonas" && agentLookup) {
					const row = state.agentById.get(agentLookup);
					return Promise.resolve(row ? [row] : []);
				}
				return Promise.resolve([]);
			},
		};
		return builder;
	}

	return {
		select() {
			return selectBuilder();
		},
		insert(_t: unknown) {
			return {
				values(v: Record<string, unknown>) {
					return {
						returning() {
							const row: PatronRow = {
								id: `patron-${state.inserts.length + 1}`,
								stewardUserId: (v.stewardUserId as string | null) ?? null,
								primaryEmail: (v.primaryEmail as string | null) ?? null,
								xUserId: v.xUserId as string | undefined,
								xHandle: v.xHandle as string | undefined,
							};
							if (row.stewardUserId) {
								state.patronByStewardId.set(row.stewardUserId, row);
							}
							state.inserts.push(v);
							return Promise.resolve([row]);
						},
					};
				},
			};
		},
	} as never;
}

// drizzle's `eq(col, value)` returns an opaque object; our fake schema columns
// embed a `_kind` so the where-clause handler can identify them. The actual
// column references in the production code are imported from `@waifufun/db`, so
// in tests we just trust them and inspect the predicate object the fake
// produces. To make this work without monkey-patching drizzle, we instead
// only check the side-effects (returned rows) — see request().

const PATRON_ID = "patron-existing";
const STEWARD_USER_ID = "steward-user-1";
const AGENT_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_ADDRESS = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const OTHER_ADDRESS = "0xbbBBbbbBbBBbBbbbBBBbbbbBBbbBbBbBbBBBBBbB";

// Helper to build a freshly-mocked db where drizzle's `eq()` is intercepted.
// We override the global `eq` behaviour by injecting a db that ignores the
// real predicate and instead reads test-controlled lookup state via a closure.
function fakeDbWith(opts: {
	patron?: PatronRow | null;
	agent?: AgentRow | null;
	capturedInserts?: Array<Record<string, unknown>>;
}) {
	const inserts = opts.capturedInserts ?? [];
	return {
		select() {
			let table: "patronUsers" | "agentPersonas" | null = null;
			const builder = {
				from(t: unknown) {
					// Inspect the table reference: drizzle table objects have a
					// [Symbol.for("drizzle:Name")] symbol whose value is the SQL name.
					const name = readDrizzleTableName(t);
					table = name === "patron_users" ? "patronUsers" : "agentPersonas";
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					if (table === "patronUsers") {
						return Promise.resolve(opts.patron ? [opts.patron] : []);
					}
					if (table === "agentPersonas") {
						return Promise.resolve(opts.agent ? [opts.agent] : []);
					}
					return Promise.resolve([]);
				},
			};
			return builder;
		},
		insert() {
			return {
				values(v: Record<string, unknown>) {
					return {
						returning() {
							inserts.push(v);
							const row: PatronRow = {
								id: PATRON_ID,
								stewardUserId: (v.stewardUserId as string | null) ?? null,
								primaryEmail: (v.primaryEmail as string | null) ?? null,
								xUserId: v.xUserId as string | undefined,
								xHandle: v.xHandle as string | undefined,
							};
							return Promise.resolve([row]);
						},
					};
				},
			};
		},
	} as never;
}

function readDrizzleTableName(t: unknown): string | null {
	if (!t || typeof t !== "object") return null;
	const sym = Object.getOwnPropertySymbols(t).find((s) => s.description === "drizzle:Name");
	if (!sym) return null;
	const value = (t as Record<symbol, unknown>)[sym];
	return typeof value === "string" ? value : null;
}

// ─── requirePatron ─────────────────────────────────────────────────

describe("requirePatron", () => {
	afterEach(() => {
		__setRequirePatronDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
	});

	function makeApp() {
		const app = new Hono<RequirePatronBindings>();
		app.use("*", requirePatron());
		app.get("/me", (c) => c.json({ patron: c.get("patron") }));
		return app;
	}

	it("401s when the Authorization header is missing and no session cookie", async () => {
		__setRequirePatronDbForTest(fakeDbWith({}));
		const res = await makeApp().request("http://x/me");
		assert.equal(res.status, 401);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "UNAUTHORIZED");
	});

	it("accepts the wf_session cookie when no Authorization header is present", async () => {
		__setRequirePatronStewardParserForTest((async () => ({
			userId: STEWARD_USER_ID,
			tenantId: "waifu",
		})) as StewardParser);
		__setRequirePatronDbForTest(
			fakeDbWith({
				patron: { id: PATRON_ID, stewardUserId: STEWARD_USER_ID, primaryEmail: null },
			}),
		);
		const res = await makeApp().request("http://x/me", {
			headers: { cookie: "wf_session=stew-jwt-from-cookie" },
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as { patron: PatronContext };
		assert.equal(body.patron.stewardUserId, STEWARD_USER_ID);
	});

	it("prefers the Authorization header over the wf_session cookie when both are present", async () => {
		let lastTokenSeen: string | null = null;
		__setRequirePatronStewardParserForTest((async (raw: string) => {
			lastTokenSeen = raw;
			return { userId: STEWARD_USER_ID, tenantId: "waifu" };
		}) as StewardParser);
		__setRequirePatronDbForTest(
			fakeDbWith({
				patron: { id: PATRON_ID, stewardUserId: STEWARD_USER_ID, primaryEmail: null },
			}),
		);
		const res = await makeApp().request("http://x/me", {
			headers: {
				authorization: "Bearer header-token",
				cookie: "wf_session=cookie-token",
			},
		});
		assert.equal(res.status, 200);
		assert.equal(lastTokenSeen, "header-token");
	});

	it("401s when the Authorization header is not Bearer", async () => {
		__setRequirePatronDbForTest(fakeDbWith({}));
		const res = await makeApp().request("http://x/me", {
			headers: { authorization: "Basic abc" },
		});
		assert.equal(res.status, 401);
	});

	it("401s when the Steward parser returns null", async () => {
		__setRequirePatronStewardParserForTest((async () => null) as StewardParser);
		__setRequirePatronDbForTest(fakeDbWith({}));
		const res = await makeApp().request("http://x/me", {
			headers: { authorization: "Bearer rejected" },
		});
		assert.equal(res.status, 401);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "UNAUTHORIZED");
	});

	it("auto-provisions a patron row on first sign-in and sets c.var.patron", async () => {
		__setRequirePatronStewardParserForTest((async () => ({
			userId: STEWARD_USER_ID,
			tenantId: "waifu",
			email: "alice@example.com",
			address: OWNER_ADDRESS,
		})) as StewardParser);

		const inserts: Array<Record<string, unknown>> = [];
		__setRequirePatronDbForTest(fakeDbWith({ patron: null, capturedInserts: inserts }));

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: "Bearer steward-token" },
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as { patron: PatronContext };
		assert.equal(body.patron.id, PATRON_ID);
		assert.equal(body.patron.stewardUserId, STEWARD_USER_ID);
		assert.equal(body.patron.email, "alice@example.com");
		assert.equal(body.patron.primaryAddress, OWNER_ADDRESS);
		assert.equal(inserts.length, 1);
		assert.equal(inserts[0]?.stewardUserId, STEWARD_USER_ID);
		assert.equal(inserts[0]?.primaryEmail, "alice@example.com");
	});

	it("uses the existing patron row when one is found by steward_user_id", async () => {
		__setRequirePatronStewardParserForTest((async () => ({
			userId: STEWARD_USER_ID,
			tenantId: "waifu",
			email: undefined,
			address: undefined,
		})) as StewardParser);

		const existing: PatronRow = {
			id: PATRON_ID,
			stewardUserId: STEWARD_USER_ID,
			primaryEmail: "stored@example.com",
		};
		const inserts: Array<Record<string, unknown>> = [];
		__setRequirePatronDbForTest(fakeDbWith({ patron: existing, capturedInserts: inserts }));

		const res = await makeApp().request("http://x/me", {
			headers: { authorization: "Bearer steward-token" },
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as { patron: PatronContext };
		assert.equal(body.patron.id, PATRON_ID);
		assert.equal(body.patron.email, "stored@example.com");
		assert.equal(body.patron.primaryAddress, null);
		assert.equal(inserts.length, 0, "should not insert when row already exists");
	});

	it("test injection hooks accept and clear custom parser + db", async () => {
		let parserCalls = 0;
		const parser: StewardParser = async () => {
			parserCalls += 1;
			return { userId: STEWARD_USER_ID, tenantId: "waifu" };
		};
		__setRequirePatronStewardParserForTest(parser);
		__setRequirePatronDbForTest(
			fakeDbWith({
				patron: { id: PATRON_ID, stewardUserId: STEWARD_USER_ID, primaryEmail: null },
			}),
		);
		const res = await makeApp().request("http://x/me", {
			headers: { authorization: "Bearer x" },
		});
		assert.equal(res.status, 200);
		assert.equal(parserCalls, 1);
	});
});

// ─── requireAgentOwnership ─────────────────────────────────────────

describe("requireAgentOwnership", () => {
	afterEach(() => {
		__setRequirePatronDbForTest(undefined);
		__setRequirePatronStewardParserForTest(undefined);
	});

	function makeApp(patron: PatronContext | null) {
		const app = new Hono<RequireAgentOwnershipBindings>();
		app.use("/agents/:id", async (c, next) => {
			if (patron) c.set("patron", patron);
			await next();
		});
		app.use("/agents/:id", requireAgentOwnership());
		app.get("/agents/:id", (c) => c.json({ agent: c.get("patronAgent") }));
		return app;
	}

	it("500s when c.var.patron is missing (programmer error)", async () => {
		__setRequirePatronDbForTest(fakeDbWith({}));
		const res = await makeApp(null).request(`http://x/agents/${AGENT_ID}`);
		assert.equal(res.status, 500);
	});

	it("404s when the agent does not exist", async () => {
		__setRequirePatronDbForTest(fakeDbWith({ agent: null }));
		const res = await makeApp({
			id: PATRON_ID,
			stewardUserId: STEWARD_USER_ID,
			email: null,
			primaryAddress: null,
		}).request(`http://x/agents/${AGENT_ID}`);
		assert.equal(res.status, 404);
	});

	it("403s when the patron's steward id does not match and there is no address", async () => {
		__setRequirePatronDbForTest(
			fakeDbWith({
				agent: {
					id: AGENT_ID,
					ownerStewardUserId: "someone-else",
					ownerAddress: OWNER_ADDRESS,
				},
			}),
		);
		const res = await makeApp({
			id: PATRON_ID,
			stewardUserId: STEWARD_USER_ID,
			email: null,
			primaryAddress: null,
		}).request(`http://x/agents/${AGENT_ID}`);
		assert.equal(res.status, 403);
	});

	it("403s when the address fallback also disagrees", async () => {
		__setRequirePatronDbForTest(
			fakeDbWith({
				agent: {
					id: AGENT_ID,
					ownerStewardUserId: null,
					ownerAddress: OWNER_ADDRESS,
				},
			}),
		);
		const res = await makeApp({
			id: PATRON_ID,
			stewardUserId: STEWARD_USER_ID,
			email: null,
			primaryAddress: OTHER_ADDRESS as `0x${string}`,
		}).request(`http://x/agents/${AGENT_ID}`);
		assert.equal(res.status, 403);
	});

	it("passes when the steward id matches and sets c.var.patronAgent", async () => {
		__setRequirePatronDbForTest(
			fakeDbWith({
				agent: {
					id: AGENT_ID,
					ownerStewardUserId: STEWARD_USER_ID,
					ownerAddress: null,
				},
			}),
		);
		const res = await makeApp({
			id: PATRON_ID,
			stewardUserId: STEWARD_USER_ID,
			email: null,
			primaryAddress: null,
		}).request(`http://x/agents/${AGENT_ID}`);
		assert.equal(res.status, 200);
		const body = (await res.json()) as { agent: AgentOwnershipContext };
		assert.equal(body.agent.id, AGENT_ID);
		assert.equal(body.agent.ownerStewardUserId, STEWARD_USER_ID);
		assert.equal(body.agent.ownerAddress, null);
	});

	it("passes via the address fallback (case-insensitive) when steward id is missing", async () => {
		__setRequirePatronDbForTest(
			fakeDbWith({
				agent: {
					id: AGENT_ID,
					ownerStewardUserId: null,
					ownerAddress: OWNER_ADDRESS.toLowerCase(),
				},
			}),
		);
		const res = await makeApp({
			id: PATRON_ID,
			stewardUserId: STEWARD_USER_ID,
			email: null,
			primaryAddress: OWNER_ADDRESS as `0x${string}`,
		}).request(`http://x/agents/${AGENT_ID}`);
		assert.equal(res.status, 200);
		const body = (await res.json()) as { agent: AgentOwnershipContext };
		assert.equal(body.agent.id, AGENT_ID);
		assert.equal(body.agent.ownerAddress, OWNER_ADDRESS.toLowerCase());
	});
});

// ─── failFastIfMisconfigured ──────────────────────────────────────

describe("failFastIfMisconfigured", () => {
	function withMockedExit<T>(fn: (record: { exited: number[] }) => T): T {
		const real = process.exit;
		const exited: number[] = [];
		// process.exit is typed as (code?: number) => never; record + return.
		(process as unknown as { exit: (code?: number) => never }).exit = ((code?: number) => {
			exited.push(code ?? 0);
			// throw to abort the test path the way real process.exit would
			// (callers should never see code after exit). The middleware function
			// returns immediately after calling process.exit, so we can recover
			// simply by NOT throwing — match that.
			return undefined as never;
		}) as never;
		try {
			return fn({ exited });
		} finally {
			(process as unknown as { exit: typeof real }).exit = real;
		}
	}

	function withSilencedConsole<T>(fn: (recorded: { errors: string[]; warns: string[] }) => T): T {
		const realError = console.error;
		const realWarn = console.warn;
		const errors: string[] = [];
		const warns: string[] = [];
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};
		console.warn = (...args: unknown[]) => {
			warns.push(args.map(String).join(" "));
		};
		try {
			return fn({ errors, warns });
		} finally {
			console.error = realError;
			console.warn = realWarn;
		}
	}

	it("does nothing in development", () => {
		withMockedExit((rec) =>
			withSilencedConsole((logs) => {
				failFastIfMisconfigured({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
				assert.deepEqual(rec.exited, []);
				assert.equal(logs.errors.length, 0);
				assert.equal(logs.warns.length, 0);
			}),
		);
	});

	it("exits in production when STEWARD_JWT_SECRET is missing", () => {
		withMockedExit((rec) =>
			withSilencedConsole(() => {
				failFastIfMisconfigured({
					NODE_ENV: "production",
					STEWARD_TENANT_ID: "waifu",
				} as NodeJS.ProcessEnv);
				assert.deepEqual(rec.exited, [1]);
			}),
		);
	});

	it("exits in production when STEWARD_JWT_SECRET is shorter than 32 chars", () => {
		withMockedExit((rec) =>
			withSilencedConsole(() => {
				failFastIfMisconfigured({
					NODE_ENV: "production",
					STEWARD_JWT_SECRET: "x".repeat(16),
					STEWARD_TENANT_ID: "waifu",
				} as NodeJS.ProcessEnv);
				assert.deepEqual(rec.exited, [1]);
			}),
		);
	});

	it("exits in production when JWT_SECRET is missing", () => {
		withMockedExit((rec) =>
			withSilencedConsole(() => {
				failFastIfMisconfigured({
					NODE_ENV: "production",
					STEWARD_JWT_SECRET: "x".repeat(64),
					STEWARD_TENANT_ID: "waifu",
				} as NodeJS.ProcessEnv);
				assert.deepEqual(rec.exited, [1]);
			}),
		);
	});

	it("exits in production when JWT_SECRET is shorter than 32 chars", () => {
		withMockedExit((rec) =>
			withSilencedConsole(() => {
				failFastIfMisconfigured({
					NODE_ENV: "production",
					STEWARD_JWT_SECRET: "x".repeat(64),
					JWT_SECRET: "x".repeat(16),
					STEWARD_TENANT_ID: "waifu",
				} as NodeJS.ProcessEnv);
				assert.deepEqual(rec.exited, [1]);
			}),
		);
	});

	it("exits in production when STEWARD_TENANT_ID is missing", () => {
		withMockedExit((rec) =>
			withSilencedConsole(() => {
				failFastIfMisconfigured({
					NODE_ENV: "production",
					STEWARD_JWT_SECRET: "x".repeat(64),
					JWT_SECRET: "x".repeat(64),
				} as NodeJS.ProcessEnv);
				assert.deepEqual(rec.exited, [1]);
			}),
		);
	});

	it("exits in production when tenant id is non-canonical", () => {
		withMockedExit((rec) =>
			withSilencedConsole((logs) => {
				failFastIfMisconfigured({
					NODE_ENV: "production",
					STEWARD_JWT_SECRET: "x".repeat(64),
					JWT_SECRET: "x".repeat(64),
					STEWARD_TENANT_ID: ["waifu", "fun"].join("-"),
				} as NodeJS.ProcessEnv);
				assert.deepEqual(rec.exited, [1]);
				assert.ok(logs.errors.some((m) => m.includes("canonical")));
			}),
		);
	});

	it("does nothing extra when production is configured canonically", () => {
		withMockedExit((rec) =>
			withSilencedConsole((logs) => {
				failFastIfMisconfigured({
					NODE_ENV: "production",
					STEWARD_JWT_SECRET: "x".repeat(64),
					JWT_SECRET: "x".repeat(64),
					STEWARD_TENANT_ID: "waifu",
				} as NodeJS.ProcessEnv);
				assert.deepEqual(rec.exited, []);
				assert.equal(logs.errors.length, 0);
				assert.equal(logs.warns.length, 0);
			}),
		);
	});
});
