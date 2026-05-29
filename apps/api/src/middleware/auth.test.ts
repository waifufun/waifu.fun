import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";

import type { AuthPrincipal } from "../contracts/auth.js";

type AuthMiddlewareModule = typeof import("./auth.js");

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_STEWARD_JWT_SECRET = process.env.STEWARD_JWT_SECRET;
const ORIGINAL_WAIFU_ADMIN_ADDRESSES = process.env.WAIFU_ADMIN_ADDRESSES;

function restoreEnv() {
	if (ORIGINAL_NODE_ENV === undefined) process.env.NODE_ENV = undefined;
	else process.env.NODE_ENV = ORIGINAL_NODE_ENV;

	if (ORIGINAL_JWT_SECRET === undefined) process.env.JWT_SECRET = undefined;
	else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;

	if (ORIGINAL_STEWARD_JWT_SECRET === undefined) process.env.STEWARD_JWT_SECRET = undefined;
	else process.env.STEWARD_JWT_SECRET = ORIGINAL_STEWARD_JWT_SECRET;

	if (ORIGINAL_WAIFU_ADMIN_ADDRESSES === undefined) process.env.WAIFU_ADMIN_ADDRESSES = undefined;
	else process.env.WAIFU_ADMIN_ADDRESSES = ORIGINAL_WAIFU_ADMIN_ADDRESSES;
}

async function makeApp() {
	const nonce = `${Date.now()}-${Math.random()}`;
	const { optionalAuth, requireAuth } = (await import(`./auth.js?test=${nonce}`)) as AuthMiddlewareModule;
	const app = new Hono();
	app.use("*", optionalAuth() as never);
	app.get("/optional", (c) => {
		const auth = (c as unknown as { get(key: "auth"): AuthPrincipal | null }).get("auth");
		return c.json({ auth });
	});
	app.get("/required", requireAuth() as never, (c) => {
		const auth = (c as unknown as { get(key: "auth"): AuthPrincipal }).get("auth");
		return c.json({ auth });
	});
	return app;
}

describe("auth middleware production bypass gating", () => {
	afterEach(() => restoreEnv());

	it("rejects dev bearer tokens in production even when JWT_SECRET is missing", async () => {
		process.env.NODE_ENV = "production";
		process.env.JWT_SECRET = undefined;
		process.env.STEWARD_JWT_SECRET = undefined;

		const res = await (await makeApp()).request("http://unit.test/optional", {
			headers: { authorization: "Bearer dev:0x1111111111111111111111111111111111111111:creator" },
		});

		assert.equal(res.status, 200);
		const body = (await res.json()) as { auth: AuthPrincipal | null };
		assert.equal(body.auth, null);
	});

	it("rejects compat headers in production even when JWT_SECRET is missing", async () => {
		process.env.NODE_ENV = "production";
		process.env.JWT_SECRET = undefined;
		process.env.STEWARD_JWT_SECRET = undefined;

		const res = await (await makeApp()).request("http://unit.test/optional", {
			headers: {
				"x-user-address": "0x1111111111111111111111111111111111111111",
				"x-user-role": "creator",
			},
		});

		assert.equal(res.status, 200);
		const body = (await res.json()) as { auth: AuthPrincipal | null };
		assert.equal(body.auth, null);
	});

	it("keeps dev bearer tokens available outside production", async () => {
		process.env.NODE_ENV = "development";
		process.env.JWT_SECRET = undefined;
		process.env.STEWARD_JWT_SECRET = undefined;

		const res = await (await makeApp()).request("http://unit.test/optional", {
			headers: { authorization: "Bearer dev:0x1111111111111111111111111111111111111111:creator" },
		});

		assert.equal(res.status, 200);
		const body = (await res.json()) as { auth: AuthPrincipal | null };
		assert.equal(body.auth?.authSource, "dev-bearer");
	});

	it("keeps compat headers available outside production", async () => {
		process.env.NODE_ENV = "development";
		process.env.JWT_SECRET = undefined;
		process.env.STEWARD_JWT_SECRET = undefined;

		const res = await (await makeApp()).request("http://unit.test/optional", {
			headers: {
				"x-user-address": "0x1111111111111111111111111111111111111111",
				"x-user-role": "creator",
			},
		});

		assert.equal(res.status, 200);
		const body = (await res.json()) as { auth: AuthPrincipal | null };
		assert.equal(body.auth?.authSource, "compat-header");
	});
});

describe("auth middleware admin address allowlist", () => {
	afterEach(() => restoreEnv());

	it("upgrades allowlisted addresses to admin without changing other principals", async () => {
		process.env.NODE_ENV = "development";
		process.env.JWT_SECRET = undefined;
		process.env.STEWARD_JWT_SECRET = undefined;
		process.env.WAIFU_ADMIN_ADDRESSES = "0x1111111111111111111111111111111111111111";

		const app = await makeApp();
		const allowlisted = await app.request("http://unit.test/optional", {
			headers: { authorization: "Bearer dev:0x1111111111111111111111111111111111111111:creator" },
		});
		const other = await app.request("http://unit.test/optional", {
			headers: { authorization: "Bearer dev:0x2222222222222222222222222222222222222222:creator" },
		});

		assert.equal(allowlisted.status, 200);
		assert.equal(other.status, 200);
		const allowlistedBody = (await allowlisted.json()) as { auth: AuthPrincipal | null };
		const otherBody = (await other.json()) as { auth: AuthPrincipal | null };
		assert.equal(allowlistedBody.auth?.role, "admin");
		assert.equal(otherBody.auth?.role, "creator");
	});

	it("leaves principals unchanged when the admin address allowlist is empty", async () => {
		process.env.NODE_ENV = "development";
		process.env.JWT_SECRET = undefined;
		process.env.STEWARD_JWT_SECRET = undefined;
		process.env.WAIFU_ADMIN_ADDRESSES = undefined;

		const res = await (await makeApp()).request("http://unit.test/optional", {
			headers: { authorization: "Bearer dev:0x1111111111111111111111111111111111111111:creator" },
		});

		assert.equal(res.status, 200);
		const body = (await res.json()) as { auth: AuthPrincipal | null };
		assert.equal(body.auth?.role, "creator");
	});
});
