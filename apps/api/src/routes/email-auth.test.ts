import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import type { StewardAuthPrincipal } from "../middleware/steward-auth.js";
import {
	EMAIL_RETURN_COOKIE,
	__setEmailDbForTest,
	__setEmailStewardClientForTest,
	__setEmailStewardVerifierForTest,
	createEmailAuthRoutes,
} from "./email-auth.js";

// ─── Test fixtures ────────────────────────────────────────────────

const STEWARD_USER_ID = "steward-user-9-11";
const PATRON_ID = "patron-email-1";

type PatronRow = {
	id: string;
	stewardUserId: string | null;
	primaryEmail: string | null;
};

function fakeDbWith(opts: {
	patron?: PatronRow | null;
	capturedInserts?: Array<Record<string, unknown>>;
	capturedUpdates?: Array<Record<string, unknown>>;
}) {
	const inserts = opts.capturedInserts ?? [];
	const updates = opts.capturedUpdates ?? [];
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
		update() {
			return {
				set(v: Record<string, unknown>) {
					updates.push(v);
					return {
						where() {
							return {
								returning() {
									const updatedRow: PatronRow = {
										id: PATRON_ID,
										stewardUserId: opts.patron?.stewardUserId ?? null,
										primaryEmail: (v.primaryEmail as string | null) ?? null,
									};
									return Promise.resolve([updatedRow]);
								},
							};
						},
					};
				},
			};
		},
	} as never;
}

function makeApp() {
	const app = new Hono<AppBindings>();
	app.use("*", async (c, next) => {
		c.set("requestId", "test-req");
		await next();
	});
	app.route("/auth/email", createEmailAuthRoutes());
	return app;
}

// ─── /auth/email/start ────────────────────────────────────────────

describe("POST /auth/email/start", () => {
	let originalEnv: NodeJS.ProcessEnv;
	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.STEWARD_API_URL = "https://eliza.steward.fi";
		process.env.STEWARD_TENANT_ID = "waifu";
		process.env.SESSION_COOKIE_SECURE = "true";
	});
	afterEach(() => {
		process.env = originalEnv;
		__setEmailStewardClientForTest(undefined);
		__setEmailStewardVerifierForTest(undefined);
		__setEmailDbForTest(undefined);
	});

	it("400s on missing JSON body", async () => {
		const res = await makeApp().request("http://x/auth/email/start", { method: "POST" });
		assert.equal(res.status, 400);
	});

	it("400s on bad email", async () => {
		const res = await makeApp().request("http://x/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "not an email" }),
		});
		assert.equal(res.status, 400);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "BAD_EMAIL");
	});

	it("forwards to Steward /auth/email/send and returns expiresAt", async () => {
		const captured: { path: string; body: unknown }[] = [];
		__setEmailStewardClientForTest(async (path, init) => {
			captured.push({ path, body: init.body });
			return {
				status: 200,
				body: { ok: true, data: { expiresAt: "2099-01-01T00:00:00.000Z" } },
			};
		});

		const res = await makeApp().request("http://x/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "Test@Example.com", return_to: "/create/wizard" }),
		});
		assert.equal(res.status, 200);

		assert.equal(captured.length, 1);
		assert.equal(captured[0]?.path, "/auth/email/send");
		// Email is normalized to lowercase before being forwarded
		assert.deepEqual(captured[0]?.body, { email: "test@example.com" });

		const body = (await res.json()) as {
			ok: boolean;
			data: { email: string; expiresAt: string };
		};
		assert.equal(body.ok, true);
		assert.equal(body.data.email, "test@example.com");
		assert.equal(body.data.expiresAt, "2099-01-01T00:00:00.000Z");

		// return_to cookie was set
		const setCookies = res.headers.getSetCookie?.() ?? [];
		const found = setCookies.find((c) => c.startsWith(`${EMAIL_RETURN_COOKIE}=`));
		assert.ok(found, "return cookie should be set");
		assert.match(found ?? "", /HttpOnly/);
	});

	it("propagates 429 from Steward", async () => {
		__setEmailStewardClientForTest(async () => ({
			status: 429,
			body: { ok: false, error: "Too many requests" },
		}));

		const res = await makeApp().request("http://x/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "user@example.com" }),
		});
		assert.equal(res.status, 429);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "RATE_LIMITED");
	});

	it("maps other Steward 5xx to 502", async () => {
		__setEmailStewardClientForTest(async () => ({
			status: 500,
			body: { ok: false, error: "boom" },
		}));

		const res = await makeApp().request("http://x/auth/email/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "user@example.com" }),
		});
		assert.equal(res.status, 502);
	});
});

// ─── /auth/email/finalize ─────────────────────────────────────────

describe("POST /auth/email/finalize", () => {
	let originalEnv: NodeJS.ProcessEnv;
	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.STEWARD_API_URL = "https://eliza.steward.fi";
		process.env.STEWARD_TENANT_ID = "waifu";
		process.env.STEWARD_JWT_SECRET = "test-secret";
		process.env.SESSION_COOKIE_SECURE = "true";
	});
	afterEach(() => {
		process.env = originalEnv;
		__setEmailStewardClientForTest(undefined);
		__setEmailStewardVerifierForTest(undefined);
		__setEmailDbForTest(undefined);
	});

	it("400s on missing token", async () => {
		const res = await makeApp().request("http://x/auth/email/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "user@example.com" }),
		});
		assert.equal(res.status, 400);
	});

	it("400s on bad email", async () => {
		const res = await makeApp().request("http://x/auth/email/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "abc123", email: "nope" }),
		});
		assert.equal(res.status, 400);
	});

	it("401s when Steward verify fails (bad/expired token)", async () => {
		__setEmailStewardClientForTest(async () => ({
			status: 401,
			body: { ok: false, error: "Invalid or expired magic link" },
		}));

		const res = await makeApp().request("http://x/auth/email/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "expired-token", email: "user@example.com" }),
		});
		assert.equal(res.status, 401);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "INVALID_MAGIC_LINK");
	});

	it("502s when Steward returns no token in response", async () => {
		__setEmailStewardClientForTest(async () => ({
			status: 200,
			body: { ok: true, data: {} },
		}));

		const res = await makeApp().request("http://x/auth/email/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "tok", email: "user@example.com" }),
		});
		assert.equal(res.status, 502);
	});

	it("provisions a new patron and sets wf_session on success", async () => {
		__setEmailStewardClientForTest(async () => ({
			status: 200,
			body: { ok: true, token: "STEWARD_JWT", refreshToken: "STEWARD_RT" },
		}));
		__setEmailStewardVerifierForTest(async (jwt) => {
			assert.equal(jwt, "STEWARD_JWT");
			const principal: StewardAuthPrincipal = {
				userId: STEWARD_USER_ID,
				email: "user@example.com",
				tenantId: "waifu",
			};
			return principal;
		});

		const inserts: Array<Record<string, unknown>> = [];
		__setEmailDbForTest(fakeDbWith({ patron: null, capturedInserts: inserts }));

		const res = await makeApp().request("http://x/auth/email/finalize", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: `${EMAIL_RETURN_COOKIE}=${encodeURIComponent("/create/wizard")}`,
			},
			body: JSON.stringify({ token: "magic-token", email: "user@example.com" }),
		});
		assert.equal(res.status, 200);

		const body = (await res.json()) as {
			ok: boolean;
			data: { return_to: string; patron: { stewardUserId: string; email: string } };
		};
		assert.equal(body.ok, true);
		assert.equal(body.data.return_to, "/create/wizard");
		assert.equal(body.data.patron.stewardUserId, STEWARD_USER_ID);

		assert.equal(inserts.length, 1);
		assert.equal(inserts[0]?.stewardUserId, STEWARD_USER_ID);
		assert.equal(inserts[0]?.primaryEmail, "user@example.com");

		const setCookies = res.headers.getSetCookie?.() ?? [];
		const wfSession = setCookies.find((c) => c.startsWith("wf_session="));
		assert.ok(wfSession, "wf_session cookie should be set");
	});

	it("uses existing patron row and backfills primaryEmail when missing", async () => {
		__setEmailStewardClientForTest(async () => ({
			status: 200,
			body: { ok: true, token: "STEWARD_JWT" },
		}));
		__setEmailStewardVerifierForTest(
			async () =>
				({
					userId: STEWARD_USER_ID,
					email: undefined,
					tenantId: "waifu",
				}) as unknown as StewardAuthPrincipal,
		);

		const updates: Array<Record<string, unknown>> = [];
		__setEmailDbForTest(
			fakeDbWith({
				patron: { id: PATRON_ID, stewardUserId: STEWARD_USER_ID, primaryEmail: null },
				capturedUpdates: updates,
			}),
		);

		const res = await makeApp().request("http://x/auth/email/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "magic-token", email: "user@example.com" }),
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as {
			data: { return_to: string; patron: { email: string } };
		};
		// No return cookie → falls back to /patron
		assert.equal(body.data.return_to, "/patron");
		assert.equal(body.data.patron.email, "user@example.com");
		assert.equal(updates.length, 1);
		assert.equal(updates[0]?.primaryEmail, "user@example.com");
	});
});
