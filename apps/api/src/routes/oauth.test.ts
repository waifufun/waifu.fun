import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import type { StewardAuthPrincipal } from "../middleware/steward-auth.js";
import {
	OAUTH_RETURN_COOKIE,
	__setOAuthDbForTest,
	__setOAuthStewardVerifierForTest,
	createOAuthRoutes,
} from "./oauth.js";

// ─── Test fixtures ────────────────────────────────────────────────

const STEWARD_USER_ID = "steward-user-9-5";
const PATRON_ID = "patron-1";

type PatronRow = {
	id: string;
	stewardUserId: string | null;
	primaryEmail: string | null;
};

function fakeDbWith(opts: {
	patron?: PatronRow | null;
	capturedInserts?: Array<Record<string, unknown>>;
}) {
	const inserts = opts.capturedInserts ?? [];
	return {
		select() {
			const builder = {
				from() {
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					return Promise.resolve(opts.patron ? [opts.patron] : []);
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
							};
							return Promise.resolve([row]);
						},
					};
				},
			};
		},
	} as never;
}

function makeApp() {
	const app = new Hono<AppBindings>();
	// Stub the deps/requestId so respondOk + tests don't crash.
	app.use("*", async (c, next) => {
		c.set("requestId", "test-req");
		await next();
	});
	app.route("/auth/oauth", createOAuthRoutes());
	return app;
}

// ─── /auth/oauth/start ────────────────────────────────────────────

describe("GET /auth/oauth/start", () => {
	let originalEnv: NodeJS.ProcessEnv;
	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.STEWARD_API_URL = "https://eliza.steward.fi";
		process.env.STEWARD_TENANT_ID = "waifu";
		process.env.FRONTEND_URL = "https://waifu.fun";
		process.env.SESSION_COOKIE_SECURE = "true";
	});
	afterEach(() => {
		process.env = originalEnv;
	});

	it("400s on unknown provider", async () => {
		const res = await makeApp().request("http://x/auth/oauth/start?provider=facebook");
		assert.equal(res.status, 400);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "INVALID_PROVIDER");
	});

	it("400s on missing provider", async () => {
		const res = await makeApp().request("http://x/auth/oauth/start");
		assert.equal(res.status, 400);
	});

	it("redirects to Steward and sets the return cookie for OAuth providers", async () => {
		const res = await makeApp().request("http://x/auth/oauth/start?provider=google&return_to=/create");
		assert.equal(res.status, 302);
		const location = res.headers.get("Location") ?? "";
		assert.ok(
			location.startsWith("https://eliza.steward.fi/auth/oauth/google/authorize"),
			`unexpected location: ${location}`,
		);
		const url = new URL(location);
		assert.equal(url.searchParams.get("tenant_id"), "waifu");
		assert.equal(url.searchParams.get("tenant"), "waifu");
		assert.equal(url.searchParams.get("redirect_uri"), "https://waifu.fun/auth/oauth/callback");

		const cookies = res.headers.getSetCookie?.() ?? [];
		const cookieStr = cookies.join(";");
		assert.ok(cookieStr.includes(OAUTH_RETURN_COOKIE));
		assert.ok(cookieStr.includes("HttpOnly"));
		assert.ok(cookieStr.includes("SameSite=Lax"));
	});

	it("rejects open-redirect return_to variants and falls back to /patron", async () => {
		for (const returnTo of [
			"https://evil.example/steal",
			"//evil.example/steal",
			"/\\evil.example",
			"/%2fevil.example",
		]) {
			const res = await makeApp().request(
				`http://x/auth/oauth/start?provider=github&return_to=${encodeURIComponent(returnTo)}`,
			);
			assert.equal(res.status, 302);
			const cookies = res.headers.getSetCookie?.() ?? [];
			const ret = cookies.find((c) => c.startsWith(`${OAUTH_RETURN_COOKIE}=`));
			assert.ok(ret);
			assert.ok(ret!.includes(encodeURIComponent("/patron")), returnTo);
		}
	});

	it("uses Steward email start path for email provider", async () => {
		const res = await makeApp().request("http://x/auth/oauth/start?provider=email");
		assert.equal(res.status, 302);
		const location = res.headers.get("Location") ?? "";
		assert.ok(location.includes("/auth/email/start"), `unexpected: ${location}`);
	});

	it("uses Steward passkey start path for passkey provider", async () => {
		const res = await makeApp().request("http://x/auth/oauth/start?provider=passkey");
		assert.equal(res.status, 302);
		const location = res.headers.get("Location") ?? "";
		assert.ok(location.includes("/auth/passkey/start"));
	});
});

// ─── /auth/oauth/finalize ─────────────────────────────────────────

describe("POST /auth/oauth/finalize", () => {
	afterEach(() => {
		__setOAuthDbForTest(undefined);
		__setOAuthStewardVerifierForTest(undefined);
	});

	it("400s on missing/invalid body", async () => {
		const res = await makeApp().request("http://x/auth/oauth/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "" }),
		});
		assert.equal(res.status, 400);
	});

	it("400s on missing JSON", async () => {
		const res = await makeApp().request("http://x/auth/oauth/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "not json",
		});
		assert.equal(res.status, 400);
	});

	it("401s when steward verification fails", async () => {
		__setOAuthStewardVerifierForTest(async () => null);
		__setOAuthDbForTest(fakeDbWith({}));
		const res = await makeApp().request("http://x/auth/oauth/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "stew-jwt" }),
		});
		assert.equal(res.status, 401);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "INVALID_STEWARD_TOKEN");
	});

	it("accepts body with extra refreshToken field and never persists it", async () => {
		// The /api/auth/finalize Next.js proxy may forward `refreshToken`; the
		// backend doesn't use it, but it must not 400 the request and must not
		// leak the token into the patron row.
		__setOAuthStewardVerifierForTest(async () => ({
			userId: STEWARD_USER_ID,
			tenantId: "waifu",
		}));
		const inserts: Array<Record<string, unknown>> = [];
		__setOAuthDbForTest(fakeDbWith({ patron: null, capturedInserts: inserts }));
		const res = await makeApp().request("http://x/auth/oauth/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "stew-jwt", refreshToken: "rt-abc" }),
		});
		assert.equal(res.status, 200);
		assert.equal(inserts.length, 1);
		const insert = inserts[0] ?? {};
		assert.ok(!Object.values(insert).includes("rt-abc"), "refreshToken value must not be persisted");
		assert.equal(insert.refreshToken, undefined);
	});

	it("succeeds for a personal-<userId> tenant principal", async () => {
		__setOAuthStewardVerifierForTest(async () => ({
			userId: STEWARD_USER_ID,
			tenantId: `personal-${STEWARD_USER_ID}`,
		}));
		__setOAuthDbForTest(
			fakeDbWith({
				patron: {
					id: PATRON_ID,
					stewardUserId: STEWARD_USER_ID,
					primaryEmail: null,
				},
			}),
		);
		const res = await makeApp().request("http://x/auth/oauth/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "stew-jwt" }),
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as {
			ok: boolean;
			data: { patron: { stewardUserId: string } };
		};
		assert.equal(body.ok, true);
		assert.equal(body.data.patron.stewardUserId, STEWARD_USER_ID);
		const setCookies = res.headers.getSetCookie?.() ?? [];
		assert.ok(setCookies.some((c) => c.includes("wf_session=stew-jwt")));
	});

	it("provisions a new patron, sets wf_session, clears return cookie, returns return_to", async () => {
		const principal: StewardAuthPrincipal = {
			userId: STEWARD_USER_ID,
			tenantId: "waifu",
			email: "alice@example.com",
		};
		__setOAuthStewardVerifierForTest(async () => principal);

		const inserts: Array<Record<string, unknown>> = [];
		__setOAuthDbForTest(fakeDbWith({ patron: null, capturedInserts: inserts }));

		const cookieHeader = `${OAUTH_RETURN_COOKIE}=${encodeURIComponent("/create")}`;

		const res = await makeApp().request("http://x/auth/oauth/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: cookieHeader },
			body: JSON.stringify({ token: "stew-jwt" }),
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as {
			ok: boolean;
			data: {
				return_to: string;
				patron: { stewardUserId: string; email: string | null };
			};
		};
		assert.equal(body.ok, true);
		assert.equal(body.data.return_to, "/create");
		assert.equal(body.data.patron.stewardUserId, STEWARD_USER_ID);
		assert.equal(body.data.patron.email, "alice@example.com");

		assert.equal(inserts.length, 1);
		assert.equal(inserts[0]?.stewardUserId, STEWARD_USER_ID);

		const setCookies = res.headers.getSetCookie?.() ?? [];
		const cookieStr = setCookies.join(";");
		assert.ok(cookieStr.includes("wf_session=stew-jwt"));
		// Return cookie cleared
		assert.ok(cookieStr.includes(`${OAUTH_RETURN_COOKIE}=;`));
	});

	it("uses existing patron row when one already exists", async () => {
		__setOAuthStewardVerifierForTest(async () => ({
			userId: STEWARD_USER_ID,
			tenantId: "waifu",
		}));
		const inserts: Array<Record<string, unknown>> = [];
		__setOAuthDbForTest(
			fakeDbWith({
				patron: {
					id: PATRON_ID,
					stewardUserId: STEWARD_USER_ID,
					primaryEmail: "stored@x.io",
				},
				capturedInserts: inserts,
			}),
		);
		const res = await makeApp().request("http://x/auth/oauth/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "stew-jwt" }),
		});
		assert.equal(res.status, 200);
		assert.equal(inserts.length, 0);
		const body = (await res.json()) as {
			data: { patron: { email: string | null } };
		};
		assert.equal(body.data.patron.email, "stored@x.io");
	});

	it("falls back to /patron when return cookie is missing or unsafe", async () => {
		__setOAuthStewardVerifierForTest(async () => ({
			userId: STEWARD_USER_ID,
			tenantId: "waifu",
		}));
		__setOAuthDbForTest(
			fakeDbWith({
				patron: {
					id: PATRON_ID,
					stewardUserId: STEWARD_USER_ID,
					primaryEmail: null,
				},
			}),
		);
		for (const returnTo of ["https://evil.example", "//evil.example", "/\\evil.example", "/%5cevil.example"]) {
			const res = await makeApp().request("http://x/auth/oauth/finalize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					cookie: `${OAUTH_RETURN_COOKIE}=${encodeURIComponent(returnTo)}`,
				},
				body: JSON.stringify({ token: "stew-jwt" }),
			});
			assert.equal(res.status, 200);
			const body = (await res.json()) as { data: { return_to: string } };
			assert.equal(body.data.return_to, "/patron", returnTo);
		}
	});
});
