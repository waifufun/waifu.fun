import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Hono } from "hono";
import type { Logger } from "pino";
import { privateKeyToAccount } from "viem/accounts";

import type { AppDependencies } from "../contracts/services.js";
import { LEGACY_LOGIN_SIWE_STATEMENT, LEGACY_LOGIN_SIWE_URI_PATH, signRefreshToken } from "../lib/auth-service.js";
import type { AppBindings } from "../lib/bindings.js";
import { apiErrorHandler } from "../middleware/error-handler.js";
import { attachRequestContext } from "../middleware/request-context.js";
import {
	__buildTwitterFinalizeRedirectForTest,
	__clearTwitterFinalizeCodesForTest,
	__issueTwitterFinalizeCodeForTest,
	createAuthRoutes,
} from "./auth.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
const ORIGINAL_TWITTER_FINALIZE_URL = process.env.TWITTER_FINALIZE_URL;

const account = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");

function restoreEnv() {
	if (ORIGINAL_NODE_ENV === undefined) process.env.NODE_ENV = undefined;
	else process.env.NODE_ENV = ORIGINAL_NODE_ENV;

	if (ORIGINAL_JWT_SECRET === undefined) process.env.JWT_SECRET = undefined;
	else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;

	if (ORIGINAL_FRONTEND_URL === undefined) process.env.FRONTEND_URL = undefined;
	else process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;

	if (ORIGINAL_TWITTER_FINALIZE_URL === undefined) process.env.TWITTER_FINALIZE_URL = undefined;
	else process.env.TWITTER_FINALIZE_URL = ORIGINAL_TWITTER_FINALIZE_URL;
}

function deps(): AppDependencies {
	return {
		config: {
			app: {
				name: "@waifufun/api-auth-test",
				env: "test",
				host: "127.0.0.1",
				port: 0,
				corsOrigins: ["https://waifu.fun"],
			},
			auth: {
				accessTokenTtlSeconds: 900,
				refreshTokenTtlSeconds: 86_400,
			},
			chain: {
				chainId: 56,
				rpcUrl: "https://bsc.example/rpc",
				portalAddress: "0x0000000000000000000000000000000000000000",
				nativeQuoteTokenSymbol: "BNB",
			},
			flap: {
				uploadApiUrl: "https://flap.example/upload",
				metadataGatewayBaseUrl: "https://flap.example/ipfs",
			},
			features: {
				curatedLaunchOnly: false,
			},
			steward: {
				jwtSecret: "test-secret",
				apiUrl: "https://steward.example",
				tenantId: "waifu",
				tenantApiKey: "tenant-key",
			},
		},
		db: {
			getCreatorProfile: async (address: string) => ({
				address,
				displayName: "Auth Test",
				bio: null,
				twitter: null,
				telegram: null,
				website: null,
				verified: false,
				featured: false,
			}),
		} as unknown as AppDependencies["db"],
		flap: {} as AppDependencies["flap"],
		runtime: {
			startedAt: new Date(0).toISOString(),
			compatibilityMode: "real-db",
			notes: [],
		},
	};
}

function logger(): Logger {
	return {
		child: () => logger(),
		error: () => {},
	} as unknown as Logger;
}

function app() {
	const h = new Hono<AppBindings>();
	h.use("*", attachRequestContext(deps(), logger()));
	h.route("/auth", createAuthRoutes());
	h.onError(apiErrorHandler);
	return h;
}

async function legacyNonce() {
	const res = await app().request("http://api.test/auth/nonce");
	assert.equal(res.status, 200);
	const body = (await res.json()) as {
		data: { nonce: string; statement: string; uriPath: string };
	};
	return body.data;
}

async function signedSiwe(input: { nonce: string; statement?: string; uriPath?: string; chainId?: number }) {
	const statement = input.statement ?? LEGACY_LOGIN_SIWE_STATEMENT;
	const uriPath = input.uriPath ?? LEGACY_LOGIN_SIWE_URI_PATH;
	const message = `waifu.fun wants you to sign in with your Ethereum account:
${account.address}

${statement}

URI: https://waifu.fun${uriPath}
Version: 1
Chain ID: ${input.chainId ?? 56}
Nonce: ${input.nonce}
Issued At: 2026-05-16T00:00:00.000Z
Expiration Time: 2030-01-01T00:00:00.000Z`;
	const signature = await account.signMessage({ message });
	return { message, signature };
}

describe("legacy SIWE auth", () => {
	afterEach(() => restoreEnv());

	it("advertises the login-specific SIWE binding with the nonce", async () => {
		process.env.NODE_ENV = "production";
		process.env.JWT_SECRET = "x".repeat(32);

		const nonce = await legacyNonce();

		assert.match(nonce.nonce, /^[A-Za-z0-9]{8,}$/);
		assert.equal(nonce.statement, LEGACY_LOGIN_SIWE_STATEMENT);
		assert.equal(nonce.uriPath, LEGACY_LOGIN_SIWE_URI_PATH);
	});

	it("accepts a production SIWE login only for the legacy login statement and URI path", async () => {
		process.env.NODE_ENV = "production";
		process.env.JWT_SECRET = "x".repeat(32);

		const nonce = await legacyNonce();
		const proof = await signedSiwe({ nonce: nonce.nonce });

		const res = await app().request("http://api.test/auth/siwe", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(proof),
		});

		assert.equal(res.status, 200);
		const body = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
		assert.equal(typeof body.data.accessToken, "string");
		assert.equal(typeof body.data.refreshToken, "string");
	});

	it("rejects same-domain SIWE signed for a different statement", async () => {
		process.env.NODE_ENV = "production";
		process.env.JWT_SECRET = "x".repeat(32);

		const nonce = await legacyNonce();
		const proof = await signedSiwe({
			nonce: nonce.nonce,
			statement: "Link this wallet to your waifu.fun patron account.",
		});

		const res = await app().request("http://api.test/auth/siwe", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(proof),
		});

		assert.equal(res.status, 400);
		const body = (await res.json()) as { error: { code: string; message: string } };
		assert.equal(body.error.code, "SIWE_CONTEXT_INVALID");
		assert.equal(body.error.message, "SIWE statement is not allowed");
	});

	it("rejects same-domain SIWE signed for a different URI path", async () => {
		process.env.NODE_ENV = "production";
		process.env.JWT_SECRET = "x".repeat(32);

		const nonce = await legacyNonce();
		const proof = await signedSiwe({ nonce: nonce.nonce, uriPath: "/patron/wallets" });

		const res = await app().request("http://api.test/auth/siwe", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(proof),
		});

		assert.equal(res.status, 400);
		const body = (await res.json()) as { error: { code: string; message: string } };
		assert.equal(body.error.code, "SIWE_CONTEXT_INVALID");
		assert.equal(body.error.message, "SIWE uri path is not allowed");
	});
});

describe("legacy refresh auth", () => {
	afterEach(() => restoreEnv());

	async function refresh(refreshToken: string) {
		return app().request("http://api.test/auth/refresh", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refreshToken }),
		});
	}

	it("rejects deterministic compat refresh tokens in production", async () => {
		process.env.NODE_ENV = "production";
		process.env.JWT_SECRET = "x".repeat(32);

		const res = await refresh(`compat-refresh:${account.address}`);

		assert.equal(res.status, 401);
		const body = (await res.json()) as { error: { code: string; message: string } };
		assert.equal(body.error.code, "UNAUTHORIZED");
		assert.equal(body.error.message, "Invalid refresh token");
	});

	it("rotates signed refresh tokens in production and rejects reuse", async () => {
		process.env.NODE_ENV = "production";
		process.env.JWT_SECRET = "x".repeat(32);
		const token = await signRefreshToken({ address: account.address, role: "creator" }, 60);

		const first = await refresh(token);
		assert.equal(first.status, 200);
		const firstBody = (await first.json()) as {
			data: { accessToken: string; refreshToken: string };
		};
		assert.match(firstBody.data.accessToken, /^[^.]+\.[^.]+\.[^.]+$/);
		assert.match(firstBody.data.refreshToken, /^[^.]+\.[^.]+\.[^.]+$/);
		assert.notEqual(firstBody.data.refreshToken, token);

		const second = await refresh(token);
		assert.equal(second.status, 401);
	});

	it("keeps deterministic compat refresh tokens available outside production", async () => {
		process.env.NODE_ENV = "development";
		process.env.JWT_SECRET = undefined;

		const res = await refresh(`compat-refresh:${account.address}`);

		assert.equal(res.status, 200);
		const body = (await res.json()) as {
			data: { accessToken: string; refreshToken: string; notes: string[] };
		};
		assert.equal(body.data.accessToken, `dev:${account.address}:creator`);
		assert.equal(body.data.refreshToken, `compat-rotated:${account.address}`);
	});
});

describe("twitter finalize handoff", () => {
	afterEach(() => {
		__clearTwitterFinalizeCodesForTest();
		restoreEnv();
	});

	it("builds finalize redirects with one-use codes instead of bearer session tokens", () => {
		process.env.NODE_ENV = "test";
		process.env.TWITTER_FINALIZE_URL = "https://waifu.fun/auth/twitter/finalize";

		const redirect = __buildTwitterFinalizeRedirectForTest("handoff-code", "/claim/abc");

		assert.ok(redirect);
		const url = new URL(redirect);
		assert.equal(url.searchParams.get("code"), "handoff-code");
		assert.equal(url.searchParams.get("token"), null);
		assert.equal(url.searchParams.get("return_to"), "/claim/abc");
	});

	it("rejects reused twitter finalize codes", async () => {
		const code = __issueTwitterFinalizeCodeForTest("session-token", "/patron");

		const first = await app().request("http://api.test/auth/twitter/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
		});
		assert.equal(first.status, 401);
		const firstBody = (await first.json()) as { error: string };
		assert.equal(firstBody.error, "INVALID_SESSION");

		const second = await app().request("http://api.test/auth/twitter/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
		});
		assert.equal(second.status, 401);
		const secondBody = (await second.json()) as { error: string };
		assert.equal(secondBody.error, "INVALID_CODE");
	});

	it("rejects legacy twitter finalize token bodies", async () => {
		const res = await app().request("http://api.test/auth/twitter/finalize", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token: "session-token" }),
		});

		assert.equal(res.status, 400);
	});
});
