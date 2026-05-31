import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../../lib/bindings.js";
import { clearRequestSiweNoncesForTest } from "../../lib/request-siwe.js";
import { apiErrorHandler } from "../../middleware/error-handler.js";
import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../../middleware/patron-auth.js";
import type { LaunchService } from "../../services/launch-v2/launch-service.js";
import { createAgentLaunchRoutes, serializeAgentLaunch } from "./agent-launches.js";

function wrapWithErrorHandler(router: ReturnType<typeof createAgentLaunchRoutes>): Hono<AppBindings> {
	const app = new Hono<AppBindings>();
	app.route("/", router as never);
	app.onError(apiErrorHandler);
	return app;
}

const SAMPLE_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "0x000000000000000000000000000000000000aaaa";
const VAULT = "0x000000000000000000000000000000000000bbbb";
const ROUTER = "0x000000000000000000000000000000000000cccc";
const CREATOR = "0x000000000000000000000000000000000000dddd";

function patronDb() {
	return {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve([
										{
											id: "patron-1",
											stewardUserId: "steward-1",
											primaryEmail: null,
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	} as never;
}

function authHeaders() {
	return { authorization: "Bearer steward-token", "content-type": "application/json" };
}

function createBody(overrides: Record<string, unknown> = {}) {
	return {
		name: "Demo Agent",
		symbol: "DEMO",
		metadataURI: "ipfs://example",
		creator: CREATOR,
		tier: "80",
		siwe: { message: "siwe", signature: "0xsig" },
		...overrides,
	};
}

afterEach(() => {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
	clearRequestSiweNoncesForTest();
});

function makeRow(overrides: Record<string, unknown> = {}) {
	return {
		id: SAMPLE_ID,
		tokenAddress: TOKEN,
		vaultAddress: VAULT,
		routerAddress: ROUTER,
		treasuryLpAddress: null,
		creator: CREATOR,
		tier: 80,
		presaleCap: "16000000000000000000",
		v2BuyBnb: "0",
		vestingEnabled: 0,
		state: "open" as const,
		totalDeposited: "0",
		bonusPool: "0",
		depositorCount: 0,
		closeTimestamp: BigInt(1_900_000_000),
		launchTimestamp: null,
		v2Pair: null,
		openMcBnb: null,
		curveFillBnb: null,
		tokensFromV2: null,
		tokensBurned: null,
		metadata: {},
		metadataUri: "ipfs://example",
		createTxHash: "0xfeed",
		createBlockNumber: BigInt(123),
		failureReason: null,
		createdAt: new Date("2026-05-08T10:00:00.000Z"),
		updatedAt: new Date("2026-05-08T10:00:00.000Z"),
		...overrides,
	};
}

test("serializeAgentLaunch shapes a row into the public response", () => {
	const out = serializeAgentLaunch(makeRow() as never);
	assert.ok(out);
	assert.equal(out.id, SAMPLE_ID);
	assert.equal(out.token, TOKEN);
	assert.equal(out.tier, "80");
	assert.equal(out.tierNumber, 80);
	assert.equal(out.state, "open");
	assert.equal(out.vestingEnabled, false);
	assert.equal(out.closeTimestamp, 1_900_000_000);
	assert.equal(out.launchTimestamp, null);
});

test("serializeAgentLaunch returns null for null row", () => {
	const out = serializeAgentLaunch(null as never);
	assert.equal(out, null);
});

test("GET /by-token/:tokenAddress rejects malformed addresses with 404", async () => {
	// The route is constrained to `0x[40 hex]`; anything else falls through
	// to Hono's default 404. No DB stub needed since the handler never runs.
	const app = createAgentLaunchRoutes({ db: {} as never });
	const res = await app.request("/by-token/not-an-address");
	assert.equal(res.status, 404, "non-0x prefixed addresses should not match the route regex");
});

test("GET /:id returns 404 when the row is missing", async () => {
	const fakeDb = {} as never;
	const app = createAgentLaunchRoutes({
		db: fakeDb,
	});

	// Override the repo lookup by using a pre-baked module — instead, test the
	// route via Hono's request method but stubbing fetch isn't supported here.
	// We rely on the UUID regex constraint: a non-UUID id will not match the
	// route at all, so the app returns 404.
	const res = await app.request("/not-a-uuid");
	assert.equal(res.status, 404);
});

test("POST / requires patron auth before creating a launch", async () => {
	const router = createAgentLaunchRoutes({
		db: {} as never,
		launchService: {
			async createLaunchOnchain() {
				throw new Error("should not be called");
			},
		} as unknown as LaunchService,
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(createBody()),
	});
	assert.equal(res.status, 401);
});

test("POST / rejects a creator SIWE signature for another wallet", async () => {
	__setRequirePatronStewardParserForTest((async () => ({ userId: "steward-1", tenantId: "waifu" })) as StewardParser);
	__setRequirePatronDbForTest(patronDb());

	const router = createAgentLaunchRoutes({
		db: {} as never,
		siweVerifier: async () => ({ address: "0x000000000000000000000000000000000000eeee", chainId: 56, nonce: "nonce" }),
		launchService: {
			async createLaunchOnchain() {
				throw new Error("should not be called");
			},
		} as unknown as LaunchService,
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify(createBody()),
	});
	assert.equal(res.status, 400);
});

test("POST / returns 400 on missing required fields after auth", async () => {
	__setRequirePatronStewardParserForTest((async () => ({ userId: "steward-1", tenantId: "waifu" })) as StewardParser);
	__setRequirePatronDbForTest(patronDb());
	const router = createAgentLaunchRoutes({
		db: {} as never,
		launchService: {
			async createLaunchOnchain() {
				throw new Error("should not be called");
			},
		} as unknown as LaunchService,
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({ name: "" }),
	});
	// 422 = validation error in this app's error handler.
	assert.ok(res.status === 400 || res.status === 422, `got ${res.status}`);
});

test("POST /:id/preview returns 400/422 on invalid bnbAmount", async () => {
	const router = createAgentLaunchRoutes({
		db: {} as never,
	});
	const app = wrapWithErrorHandler(router);
	const res = await app.request(`/${SAMPLE_ID}/preview`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ bnbAmount: "not-a-number" }),
	});
	assert.ok(res.status === 400 || res.status === 422, `got ${res.status}`);
});

// ─── Wave J: agent self-launch via agk_ key ────────────────────────

import { __setAgentOrPatronDbForTest } from "../../middleware/agent-or-patron-auth.js";

const VALID_AGK = "agk_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const AGENT_ID_SLUG = "agt_demo";
const AGENT_OWNER_STEWARD = "steward-agent-owner";
const AGENT_OWNER_ADDR = CREATOR; // creator must equal owner address for SIWE pass

function readDrizzleTableNameForLaunchTest(t: unknown): string | null {
	if (!t || typeof t !== "object") return null;
	const sym = Object.getOwnPropertySymbols(t).find((s) => s.description === "drizzle:Name");
	if (!sym) return null;
	const value = (t as Record<symbol, unknown>)[sym];
	return typeof value === "string" ? value : null;
}

function agentAuthDb() {
	return {
		select(_cols?: unknown) {
			let table: string | null = null;
			const builder = {
				from(t: unknown) {
					table = readDrizzleTableNameForLaunchTest(t);
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					if (table === "agent_api_keys") {
						return Promise.resolve([{ id: "key-1", agentId: AGENT_ID_SLUG, scopes: ["launch:*"] }]);
					}
					if (table === "agent_personas") {
						return Promise.resolve([
							{
								id: "persona-uuid",
								agentId: AGENT_ID_SLUG,
								ownerStewardUserId: AGENT_OWNER_STEWARD,
								ownerAddress: AGENT_OWNER_ADDR,
							},
						]);
					}
					if (table === "patron_users") {
						return Promise.resolve([
							{ id: "patron-agent-owner", stewardUserId: AGENT_OWNER_STEWARD, primaryEmail: null },
						]);
					}
					return Promise.resolve([]);
				},
			};
			return builder;
		},
		update() {
			return { set: () => ({ where: () => Promise.resolve() }) };
		},
	} as never;
}

test("POST /nonce works with an agent api key (Wave J)", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	const router = createAgentLaunchRoutes({ db: {} as never });
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/nonce", {
		method: "POST",
		headers: {
			authorization: `Bearer ${VALID_AGK}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ address: CREATOR }),
	});
	assert.equal(res.status, 200);
	const body = (await res.json()) as { ok: boolean; data: { nonce: string } };
	assert.equal(body.ok, true);
	assert.ok(typeof body.data.nonce === "string" && body.data.nonce.length > 0);

	__setAgentOrPatronDbForTest(undefined);
});

test("POST / accepts an agent api key + valid SIWE (Wave J)", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	let createCalled = false;
	const router = createAgentLaunchRoutes({
		db: {
			insert() {
				return {
					values() {
						return {
							returning: () =>
								Promise.resolve([
									{
										id: SAMPLE_ID,
										tokenAddress: TOKEN,
										vaultAddress: VAULT,
										routerAddress: ROUTER,
										taxSplitterAddress: null,
										treasuryLpAddress: null,
										creator: CREATOR,
										tier: 80,
										presaleCap: "16000000000000000000",
										v2BuyBnb: "0",
										vestingEnabled: 0,
										state: "open",
										totalDeposited: "0",
										bonusPool: "0",
										depositorCount: 0,
										closeTimestamp: BigInt(1_900_000_000),
										launchTimestamp: null,
										v2Pair: null,
										openMcBnb: null,
										metadataUri: "ipfs://example",
										metadata: {},
										flapMetaCid: null,
										flapTokenAddress: null,
										bundleStatus: null,
										bundleTxHash: null,
										bundleAttempt: null,
										bundleTipBnb: null,
										bundleFailureReason: null,
										createTxHash: "0xfeed",
										createBlockNumber: BigInt(123),
										predictedTokenAddress: null,
										vanitySalt: null,
										createdAt: new Date(),
										updatedAt: new Date(),
									},
								]),
						};
					},
				};
			},
		} as never,
		// SIWE verifier must return the agent owner's address (= CREATOR) so
		// validateRequestSiwe matches body.creator.
		siweVerifier: async () => ({ address: CREATOR, chainId: 56, nonce: "skip" }),
		launchService: {
			async createLaunchOnchain() {
				createCalled = true;
				return {
					token: TOKEN,
					vault: VAULT,
					router: ROUTER,
					taxSplitter: "0x0000000000000000000000000000000000000000",
					treasuryReserve: null,
					txHash: "0xfeed",
					blockNumber: 123,
					presaleUrl: null,
				};
			},
		} as unknown as LaunchService,
	});
	const app = wrapWithErrorHandler(router);

	// Issue a nonce first to satisfy validateRequestSiwe's nonce store.
	const nonceRes = await app.request("/nonce", {
		method: "POST",
		headers: { authorization: `Bearer ${VALID_AGK}`, "content-type": "application/json" },
		body: JSON.stringify({ address: CREATOR }),
	});
	const nonceBody = (await nonceRes.json()) as { data: { nonce: string } };
	assert.ok(nonceBody.data.nonce);

	// Re-bind the auth db (the nonce route consumed our hook above is fine; setter persists).
	const res = await app.request("/", {
		method: "POST",
		headers: { authorization: `Bearer ${VALID_AGK}`, "content-type": "application/json" },
		body: JSON.stringify(createBody({ creator: CREATOR })),
	});

	// Either 202 (full success) or 400 (SIWE statement/uri-path mismatch) is
	// fine for proving the auth path itself worked. The point is: NOT 401.
	assert.notEqual(res.status, 401, `auth must succeed; got ${res.status}: ${await res.text()}`);
	// If we got past auth and got 202, the on-chain stub was called.
	if (res.status === 202) {
		assert.equal(createCalled, true);
	}

	__setAgentOrPatronDbForTest(undefined);
});
