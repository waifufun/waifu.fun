import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import type { StewardAuthPrincipal } from "../middleware/steward-auth.js";
import { __setPasskeyDbForTest, __setPasskeyStewardVerifierForTest, createPasskeyAuthRoutes } from "./passkey-auth.js";

const STEWARD_USER_ID = "steward-user-passkey";
const PATRON_ID = "patron-passkey-1";

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
	app.route("/auth/passkey", createPasskeyAuthRoutes());
	return app;
}

describe("POST /auth/passkey/finalize", () => {
	let originalEnv: NodeJS.ProcessEnv;
	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.STEWARD_TENANT_ID = "waifu";
		process.env.STEWARD_JWT_SECRET = "test-secret";
		process.env.SESSION_COOKIE_SECURE = "true";
	});
	afterEach(() => {
		process.env = originalEnv;
		__setPasskeyStewardVerifierForTest(undefined);
		__setPasskeyDbForTest(undefined);
	});

	it("400s on missing JSON body", async () => {
		const res = await makeApp().request("http://x/auth/passkey/finalize", { method: "POST" });
		assert.equal(res.status, 400);
	});

	it("400s on missing token", async () => {
		const res = await makeApp().request("http://x/auth/passkey/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "user@example.com" }),
		});
		assert.equal(res.status, 400);
	});

	it("401s when Steward verify fails", async () => {
		__setPasskeyStewardVerifierForTest(async () => null);
		const res = await makeApp().request("http://x/auth/passkey/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "bad-token" }),
		});
		assert.equal(res.status, 401);
		const body = (await res.json()) as { error: string };
		assert.equal(body.error, "INVALID_STEWARD_TOKEN");
	});

	it("provisions a new patron + sets wf_session on success", async () => {
		__setPasskeyStewardVerifierForTest(async (jwt) => {
			assert.equal(jwt, "STEWARD_JWT");
			const principal: StewardAuthPrincipal = {
				userId: STEWARD_USER_ID,
				email: "user@example.com",
				tenantId: "waifu",
			};
			return principal;
		});

		const inserts: Array<Record<string, unknown>> = [];
		__setPasskeyDbForTest(fakeDbWith({ patron: null, capturedInserts: inserts }));

		const res = await makeApp().request("http://x/auth/passkey/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				token: "STEWARD_JWT",
				email: "user@example.com",
				return_to: "/create/wizard",
			}),
		});
		assert.equal(res.status, 200);

		const body = (await res.json()) as {
			ok: boolean;
			data: {
				return_to: string;
				patron: { stewardUserId: string; email: string };
			};
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

	it("uses existing patron, falls back to /patron when return_to missing", async () => {
		__setPasskeyStewardVerifierForTest(
			async () =>
				({
					userId: STEWARD_USER_ID,
					email: "user@example.com",
					tenantId: "waifu",
				}) as StewardAuthPrincipal,
		);

		__setPasskeyDbForTest(
			fakeDbWith({
				patron: {
					id: PATRON_ID,
					stewardUserId: STEWARD_USER_ID,
					primaryEmail: "user@example.com",
				},
			}),
		);

		const res = await makeApp().request("http://x/auth/passkey/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "STEWARD_JWT" }),
		});
		assert.equal(res.status, 200);

		const body = (await res.json()) as { data: { return_to: string } };
		assert.equal(body.data.return_to, "/patron");
	});

	it("rejects open-redirect return_to variants and falls back to /patron", async () => {
		__setPasskeyStewardVerifierForTest(
			async () =>
				({
					userId: STEWARD_USER_ID,
					email: "user@example.com",
					tenantId: "waifu",
				}) as StewardAuthPrincipal,
		);

		__setPasskeyDbForTest(
			fakeDbWith({
				patron: {
					id: PATRON_ID,
					stewardUserId: STEWARD_USER_ID,
					primaryEmail: "user@example.com",
				},
			}),
		);

		for (const returnTo of [
			"https://evil.example/steal",
			"//evil.example/steal",
			"/\\evil.example",
			"/%2fevil.example",
		]) {
			const res = await makeApp().request("http://x/auth/passkey/finalize", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: "STEWARD_JWT",
					return_to: returnTo,
				}),
			});
			assert.equal(res.status, 200);

			const body = (await res.json()) as { data: { return_to: string } };
			assert.equal(body.data.return_to, "/patron", returnTo);
		}
	});
});
