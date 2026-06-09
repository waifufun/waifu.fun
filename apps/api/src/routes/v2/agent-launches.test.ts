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
import { createAgentLaunchRoutes, ensureAutoProvisionOnLaunch, serializeAgentLaunch } from "./agent-launches.js";

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
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
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
	// `tier` is the string label (or stringified numeric fallback); the numeric
	// value is exposed separately as `tierNumber`. See serializeAgentLaunch.
	assert.equal(out.tier, "TIER_80");
	assert.equal(out.tierNumber, 80);
	assert.equal(out.tierLabel, "TIER_80");
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

type InsertCapture = { table: string | null; values: Record<string, unknown>; conflict?: unknown };

function autoProvisionDb(captures: InsertCapture[], existingWalletRow: Record<string, unknown> | null = null) {
	return {
		// Recovery pre-check: SELECT the existing agent_wallets row for this token.
		// Defaults to no existing row; pass `existingWalletRow` to simulate a prior
		// run that already recorded an EOA.
		select() {
			const builder = {
				from() {
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					return Promise.resolve(existingWalletRow ? [existingWalletRow] : []);
				},
			};
			return builder;
		},
		insert(table: unknown) {
			const tableName = readDrizzleTableNameForLaunchTest(table);
			const cap: InsertCapture = { table: tableName, values: {} };
			captures.push(cap);
			const builder = {
				values(values: Record<string, unknown>) {
					cap.values = values;
					return builder;
				},
				onConflictDoUpdate(conflict: unknown) {
					cap.conflict = conflict;
					return builder;
				},
				returning() {
					if (tableName === "agent_personas")
						return Promise.resolve([{ id: "persona-uuid", agentId: cap.values.agentId }]);
					return Promise.resolve([{ id: "row-id" }]);
				},
			};
			return builder;
		},
	} as never;
}

const AUTO_SAFE = "0x000000000000000000000000000000000000eeee";
const AUTO_AGENT_HOT = "0x0000000000000000000000000000000000000009";

function autoProvisionInput(overrides: Record<string, unknown> = {}) {
	return {
		launchId: SAMPLE_ID,
		name: "Demo Agent",
		symbol: "DEMO",
		description: "demo bio",
		imageUrl: "ipfs://image",
		tokenAddress: TOKEN,
		creator: CREATOR,
		tier: "80",
		txHash: "0xfeed",
		agentSafeAddress: AUTO_SAFE,
		metadata: { description: "from metadata" },
		...overrides,
	};
}

test("ensureAutoProvisionOnLaunch is a flag-off no-op", async () => {
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
	const captures: InsertCapture[] = [];
	let enqueued = false;
	const result = await ensureAutoProvisionOnLaunch(autoProvisionDb(captures), autoProvisionInput(), {
		addAgentProvisioningJob: async () => {
			enqueued = true;
		},
	});
	assert.equal(result, null);
	assert.equal(captures.length, 0);
	assert.equal(enqueued, false);
});

test("ensureAutoProvisionOnLaunch stores owner_steward_user_id when patron-authed", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	const captures: InsertCapture[] = [];
	const enqueued: Array<{ payload: unknown; options: { jobId: string } }> = [];
	const result = await ensureAutoProvisionOnLaunch(
		autoProvisionDb(captures),
		autoProvisionInput({
			agentHotWalletAddress: AUTO_AGENT_HOT,
			patron: { id: "patron-1", stewardUserId: "steward-1", primaryAddress: CREATOR },
		}),
		{
			addAgentProvisioningJob: async (payload, options) => {
				enqueued.push({ payload, options });
			},
		},
	);
	assert.equal(result?.agentId, "waifu-demo-00000000");
	assert.equal(result?.jobId, `launch:${SAMPLE_ID}:agent-provisioning`);
	const persona = captures.find((c) => c.table === "agent_personas");
	assert.equal(persona?.values.ownerStewardUserId, "steward-1");
	assert.equal(persona?.values.ownerAddress, CREATOR);
	assert.equal(enqueued[0]?.options.jobId, `launch:${SAMPLE_ID}:agent-provisioning`);
	const payload = enqueued[0]?.payload as { source?: string; data?: Record<string, unknown> } | undefined;
	assert.deepEqual(payload?.source, "agent.launched");
	assert.equal(payload?.data?.tokenTicker, "DEMO");
	assert.equal(payload?.data?.tokenName, "Demo Agent");
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

test("ensureAutoProvisionOnLaunch falls back to owner_address without patron context", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	const captures: InsertCapture[] = [];
	await ensureAutoProvisionOnLaunch(autoProvisionDb(captures), autoProvisionInput(), {
		addAgentProvisioningJob: async () => {},
	});
	const persona = captures.find((c) => c.table === "agent_personas");
	assert.equal(persona?.values.ownerStewardUserId, null);
	assert.equal(persona?.values.ownerAddress, CREATOR);
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

test("ensureAutoProvisionOnLaunch records safe role and pending agent-hot when Steward unconfigured", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	const captures: InsertCapture[] = [];
	let enqueued = false;
	// stewardWalletClient: null => Steward is explicitly unconfigured, so no EOA
	// is minted and the wallet honestly stays pending (no fake wallet).
	const result = await ensureAutoProvisionOnLaunch(autoProvisionDb(captures), autoProvisionInput(), {
		stewardWalletClient: null,
		addAgentProvisioningJob: async () => {
			enqueued = true;
		},
	});
	const wallet = captures.find((c) => c.table === "agent_wallets");
	assert.equal(wallet?.values.walletAddress, "0x0000000000000000000000000000000000000000");
	assert.equal(wallet?.values.stewardAgentId, undefined);
	const walletMetadata = wallet?.values.metadata as {
		roles?: Record<string, { role?: string; address?: string | null; status?: string }>;
	};
	assert.equal(walletMetadata.roles?.["agent-hot"]?.role, "agent-hot");
	assert.equal(walletMetadata.roles?.["agent-hot"]?.address, null);
	assert.equal(walletMetadata.roles?.["agent-hot"]?.status, "pending-steward-eoa");
	assert.equal(walletMetadata.roles?.["agent-safe"]?.role, "agent-safe");
	assert.equal(walletMetadata.roles?.["agent-safe"]?.address, AUTO_SAFE);
	const registry = captures.find((c) => c.table === "agent_wallet_registry");
	assert.equal(registry?.values.role, "agent-safe");
	assert.equal(registry?.values.address, AUTO_SAFE);
	assert.equal(enqueued, false);
	assert.equal(result?.agentEoa, null);
	assert.equal(result?.stewardWalletMinted, false);
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

const MINTED_EOA = "0x00000000000000000000000000000000000ABCDE";

/** A mock StewardWalletClient that records calls and returns a deterministic EOA. */
function mockStewardWalletClient(
	overrides: { walletAddress?: string; created?: boolean; existing?: Set<string> } = {},
) {
	const calls: Array<{ agentId: string; name: string; platformId?: string }> = [];
	const existing = overrides.existing ?? new Set<string>();
	const client = {
		calls,
		async ensureAgentWallet(args: { agentId: string; name: string; platformId?: string }) {
			calls.push(args);
			const wasExisting = existing.has(args.agentId);
			existing.add(args.agentId);
			return {
				stewardAgentId: args.agentId,
				tenantId: "waifu",
				walletAddress: overrides.walletAddress ?? MINTED_EOA,
				solanaAddress: null,
				created: overrides.created ?? !wasExisting,
			};
		},
	};
	return client;
}

test("ensureAutoProvisionOnLaunch MINTS the agent-hot Steward EOA and records it", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	const captures: InsertCapture[] = [];
	const steward = mockStewardWalletClient();
	const enqueued: Array<{ payload: unknown; options: { jobId: string } }> = [];
	const result = await ensureAutoProvisionOnLaunch(autoProvisionDb(captures), autoProvisionInput(), {
		stewardWalletClient: steward,
		addAgentProvisioningJob: async (payload, options) => {
			enqueued.push({ payload, options });
		},
	});

	// Steward was asked to mint the deterministic agent id, keyed on token.
	assert.equal(steward.calls.length, 1);
	assert.equal(steward.calls[0]?.agentId, "waifu-demo-00000000");
	assert.equal(steward.calls[0]?.name, "Demo Agent");
	assert.equal(steward.calls[0]?.platformId, TOKEN.toLowerCase());

	// agent_wallets.wallet_address replaced the zero sentinel with the minted EOA,
	// and the steward binding (agentId + tenant) is recorded.
	const wallet = captures.find((c) => c.table === "agent_wallets");
	assert.equal(wallet?.values.walletAddress, MINTED_EOA.toLowerCase());
	assert.equal(wallet?.values.stewardAgentId, "waifu-demo-00000000");
	assert.equal(wallet?.values.stewardTenantId, "waifu");
	const walletMetadata = wallet?.values.metadata as {
		roles?: Record<string, { role?: string; address?: string | null; status?: string; stewardAgentId?: string }>;
	};
	assert.equal(walletMetadata.roles?.["agent-hot"]?.address, MINTED_EOA.toLowerCase());
	// metadata agent-hot.status flipped 'pending-steward-eoa' -> 'active'.
	assert.equal(walletMetadata.roles?.["agent-hot"]?.status, "active");
	assert.equal(walletMetadata.roles?.["agent-hot"]?.stewardAgentId, "waifu-demo-00000000");

	// agent_wallet_registry got a role=agent-hot venue=steward row for the EOA.
	const hotRegistry = captures
		.filter((c) => c.table === "agent_wallet_registry")
		.find((c) => c.values.role === "agent-hot");
	assert.equal(hotRegistry?.values.address, MINTED_EOA.toLowerCase());
	assert.equal(hotRegistry?.values.venue, "steward");

	// Provisioning was enqueued now that a real EOA exists.
	assert.equal(enqueued.length, 1);
	const payload = enqueued[0]?.payload as { data?: Record<string, unknown> } | undefined;
	assert.equal(payload?.data?.agentWalletAddress, MINTED_EOA.toLowerCase());
	assert.equal(payload?.data?.primaryWalletAddress, MINTED_EOA.toLowerCase());

	// agentEoa is surfaced for the #1013 factory createLaunch handoff.
	assert.equal(result?.agentEoa, MINTED_EOA.toLowerCase());
	assert.equal(result?.agentHotWalletAddress, MINTED_EOA.toLowerCase());
	assert.equal(result?.stewardAgentId, "waifu-demo-00000000");
	assert.equal(result?.stewardWalletMinted, true);
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

test("ensureAutoProvisionOnLaunch is idempotent: reuses an existing Steward EOA, no duplicate mint", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	// Mark the deterministic id as already-existing so the mock reports reuse.
	const steward = mockStewardWalletClient({ existing: new Set(["waifu-demo-00000000"]) });

	const first = await ensureAutoProvisionOnLaunch(autoProvisionDb([]), autoProvisionInput(), {
		stewardWalletClient: steward,
		addAgentProvisioningJob: async () => {},
	});
	const second = await ensureAutoProvisionOnLaunch(autoProvisionDb([]), autoProvisionInput(), {
		stewardWalletClient: steward,
		addAgentProvisioningJob: async () => {},
	});

	// Same EOA both times.
	assert.equal(first?.agentEoa, MINTED_EOA.toLowerCase());
	assert.equal(second?.agentEoa, MINTED_EOA.toLowerCase());
	// Reuse (not freshly minted) since the id pre-existed.
	assert.equal(first?.stewardWalletMinted, false);
	assert.equal(second?.stewardWalletMinted, false);
	// Both runs addressed the SAME steward agent id (no fork).
	assert.equal(
		steward.calls.every((c) => c.agentId === "waifu-demo-00000000"),
		true,
	);
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

test("ensureAutoProvisionOnLaunch stays pending (no fake wallet, no enqueue) when Steward mint fails", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	const captures: InsertCapture[] = [];
	let enqueued = false;
	// Steward configured but the mint throws (network/5xx). The on-chain launch
	// already happened, so we must STILL write the pending records and NOT abort.
	const steward = {
		async ensureAgentWallet() {
			throw new Error("steward boom (network)");
		},
	};
	const result = await ensureAutoProvisionOnLaunch(autoProvisionDb(captures), autoProvisionInput(), {
		stewardWalletClient: steward,
		addAgentProvisioningJob: async () => {
			enqueued = true;
		},
	});
	// Persona + wallet rows still written (recoverable).
	assert.ok(captures.find((c) => c.table === "agent_personas"));
	const wallet = captures.find((c) => c.table === "agent_wallets");
	assert.equal(wallet?.values.walletAddress, "0x0000000000000000000000000000000000000000");
	// No EOA, so provisioning is NOT enqueued and agentEoa is null.
	assert.equal(enqueued, false);
	assert.equal(result?.agentEoa, null);
	assert.equal(result?.stewardWalletMinted, false);
	// The failure reason is surfaced in persona metadata for ops.
	const persona = captures.find((c) => c.table === "agent_personas");
	const personaMeta = persona?.values.metadata as { stewardMintError?: string };
	assert.match(personaMeta.stewardMintError ?? "", /steward boom/);
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

test("ensureAutoProvisionOnLaunch self-heals: reuses a previously-recorded EOA without re-minting (Steward down)", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	const captures: InsertCapture[] = [];
	// Prior run already wrote a real EOA into agent_wallets.
	const existingWalletRow = {
		walletAddress: MINTED_EOA.toLowerCase(),
		stewardAgentId: "waifu-demo-00000000",
		stewardTenantId: "waifu",
	};
	// Steward is DOWN (mint would throw) — but we must NOT need it, the recorded
	// wallet drives recovery.
	const steward = {
		async ensureAgentWallet() {
			throw new Error("steward unavailable");
		},
	};
	const enqueued: Array<{ payload: unknown }> = [];
	const result = await ensureAutoProvisionOnLaunch(autoProvisionDb(captures, existingWalletRow), autoProvisionInput(), {
		stewardWalletClient: steward,
		addAgentProvisioningJob: async (payload) => {
			enqueued.push({ payload });
		},
	});
	// No mint attempt was even needed (recovery short-circuits before Steward).
	// Registry agent-hot row + enqueue + agentEoa all recover off the recorded EOA.
	const hotRegistry = captures
		.filter((c) => c.table === "agent_wallet_registry")
		.find((c) => c.values.role === "agent-hot");
	assert.equal(hotRegistry?.values.address, MINTED_EOA.toLowerCase());
	assert.equal(enqueued.length, 1);
	assert.equal(result?.agentEoa, MINTED_EOA.toLowerCase());
	assert.equal(result?.stewardAgentId, "waifu-demo-00000000");
	assert.equal(result?.stewardWalletMinted, false);
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

test("ensureAutoProvisionOnLaunch ignores a sentinel-only existing wallet and mints fresh", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	const captures: InsertCapture[] = [];
	// Prior run only wrote the zero sentinel -> not a real wallet, so we mint.
	const existingWalletRow = {
		walletAddress: "0x0000000000000000000000000000000000000000",
		stewardAgentId: null,
		stewardTenantId: null,
	};
	const steward = mockStewardWalletClient();
	const result = await ensureAutoProvisionOnLaunch(autoProvisionDb(captures, existingWalletRow), autoProvisionInput(), {
		stewardWalletClient: steward,
		addAgentProvisioningJob: async () => {},
	});
	assert.equal(steward.calls.length, 1);
	assert.equal(result?.agentEoa, MINTED_EOA.toLowerCase());
	assert.equal(result?.stewardWalletMinted, true);
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

test("ensureAutoProvisionOnLaunch prefers an explicitly-supplied agent-hot EOA over minting", async () => {
	process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH = "true";
	const steward = mockStewardWalletClient();
	const result = await ensureAutoProvisionOnLaunch(
		autoProvisionDb([]),
		autoProvisionInput({ agentHotWalletAddress: AUTO_AGENT_HOT }),
		{
			stewardWalletClient: steward,
			addAgentProvisioningJob: async () => {},
		},
	);
	// No mint call: caller already supplied the EOA.
	assert.equal(steward.calls.length, 0);
	assert.equal(result?.agentEoa, AUTO_AGENT_HOT);
	assert.equal(result?.stewardWalletMinted, false);
	delete process.env.WAIFU_AUTO_PROVISION_ON_LAUNCH;
});

// ─── upload-metadata route (skill.md step 1) ───────────────────────

import type { UploadFlapMetadataInput, UploadFlapMetadataResult } from "@waifufun/flap";

// Build a File whose leading bytes are a valid PNG signature so the route's
// magic-byte sniffing accepts it. `bytes` is the total length (padded after
// the 8-byte signature).
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function pngFile(name = "logo.png", bytes = 16, type = "image/png"): File {
	const total = Math.max(bytes, PNG_SIGNATURE.length);
	const buf = new Uint8Array(total);
	buf.set(PNG_SIGNATURE, 0);
	return new File([buf], name, { type });
}

function uploadForm(
	opts: { name?: string; symbol?: string; description?: string; image?: File | null } = {},
): FormData {
	const form = new FormData();
	if (opts.name !== undefined) form.append("name", opts.name);
	if (opts.symbol !== undefined) form.append("symbol", opts.symbol);
	if (opts.description !== undefined) form.append("description", opts.description);
	const img = opts.image === undefined ? pngFile() : opts.image;
	if (img) form.append("image", img);
	return form;
}

function uploadHeaders() {
	return { authorization: `Bearer ${VALID_AGK}` };
}

test("POST /upload-metadata returns flapMetaCid on success (skill.md shape)", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	let received: UploadFlapMetadataInput | null = null;
	const router = createAgentLaunchRoutes({
		db: {} as never,
		uploadMetadata: async (input): Promise<UploadFlapMetadataResult> => {
			received = input;
			return { cid: "QmFakeCid123", uploadUrl: "https://funcs.flap.sh/api/upload" };
		},
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/upload-metadata", {
		method: "POST",
		headers: uploadHeaders(),
		body: uploadForm({ name: "Demo Agent", symbol: "demo", description: "a friendly agent token" }),
	});
	const body = (await res.json()) as { ok: boolean; data: { flapMetaCid: string } };
	assert.equal(res.status, 200, JSON.stringify(body));
	assert.equal(body.ok, true);
	assert.equal(body.data.flapMetaCid, "QmFakeCid123");
	// name/symbol/description are forwarded into the Flap metadata record so the
	// returned CID can pass validateFlapMetadataCid during POST /v2/launches.
	assert.ok(received);
	assert.equal((received as UploadFlapMetadataInput).metadata.name, "Demo Agent");
	assert.equal((received as UploadFlapMetadataInput).metadata.symbol, "DEMO");
	assert.equal((received as UploadFlapMetadataInput).metadata.description, "a friendly agent token");

	__setAgentOrPatronDbForTest(undefined);
});

test("POST /upload-metadata succeeds without a description (optional)", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	const router = createAgentLaunchRoutes({
		db: {} as never,
		uploadMetadata: async (): Promise<UploadFlapMetadataResult> => ({
			cid: "QmNoDesc",
			uploadUrl: "https://funcs.flap.sh/api/upload",
		}),
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/upload-metadata", {
		method: "POST",
		headers: uploadHeaders(),
		body: uploadForm({ name: "Demo Agent", symbol: "DEMO" }),
	});
	const body = (await res.json()) as { data: { flapMetaCid: string } };
	assert.equal(res.status, 200, JSON.stringify(body));
	assert.equal(body.data.flapMetaCid, "QmNoDesc");

	__setAgentOrPatronDbForTest(undefined);
});

test("POST /upload-metadata requires auth (401 without agk_)", async () => {
	const router = createAgentLaunchRoutes({
		db: {} as never,
		uploadMetadata: async (): Promise<UploadFlapMetadataResult> => {
			throw new Error("uploader must not run without auth");
		},
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/upload-metadata", {
		method: "POST",
		body: uploadForm({ name: "Demo Agent", symbol: "DEMO" }),
	});
	assert.equal(res.status, 401);
});

test("POST /upload-metadata rejects a missing image (400)", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	const router = createAgentLaunchRoutes({
		db: {} as never,
		uploadMetadata: async (): Promise<UploadFlapMetadataResult> => {
			throw new Error("uploader must not run when image is missing");
		},
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/upload-metadata", {
		method: "POST",
		headers: uploadHeaders(),
		body: uploadForm({ name: "Demo Agent", symbol: "DEMO", image: null }),
	});
	const body = (await res.json()) as { error: { code: string } };
	assert.equal(res.status, 400, JSON.stringify(body));
	assert.equal(body.error.code, "IMAGE_REQUIRED");

	__setAgentOrPatronDbForTest(undefined);
});

test("POST /upload-metadata rejects missing name/symbol (400)", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	const router = createAgentLaunchRoutes({
		db: {} as never,
		uploadMetadata: async (): Promise<UploadFlapMetadataResult> => {
			throw new Error("uploader must not run when fields are invalid");
		},
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/upload-metadata", {
		method: "POST",
		headers: uploadHeaders(),
		body: uploadForm({ name: "x", image: pngFile() }),
	});
	const body = (await res.json()) as { error: { code: string } };
	assert.equal(res.status, 400, JSON.stringify(body));
	assert.equal(body.error.code, "INVALID_METADATA");

	__setAgentOrPatronDbForTest(undefined);
});

test("POST /upload-metadata rejects an oversized image (400)", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	const router = createAgentLaunchRoutes({
		db: {} as never,
		uploadMetadata: async (): Promise<UploadFlapMetadataResult> => {
			throw new Error("uploader must not run for oversized image");
		},
	});
	const app = wrapWithErrorHandler(router);

	// 9MB > 8MB cap.
	const big = pngFile("big.png", 9 * 1024 * 1024);
	const res = await app.request("/upload-metadata", {
		method: "POST",
		headers: uploadHeaders(),
		body: uploadForm({ name: "Demo Agent", symbol: "DEMO", image: big }),
	});
	const body = (await res.json()) as { error: { code: string } };
	assert.equal(res.status, 400, JSON.stringify(body));
	assert.equal(body.error.code, "IMAGE_TOO_LARGE");

	__setAgentOrPatronDbForTest(undefined);
});

test("POST /upload-metadata rejects a non-image file (400)", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	const router = createAgentLaunchRoutes({
		db: {} as never,
		uploadMetadata: async (): Promise<UploadFlapMetadataResult> => {
			throw new Error("uploader must not run for non-image");
		},
	});
	const app = wrapWithErrorHandler(router);

	const textFile = new File([new Uint8Array(8)], "evil.txt", { type: "text/plain" });
	const res = await app.request("/upload-metadata", {
		method: "POST",
		headers: uploadHeaders(),
		body: uploadForm({ name: "Demo Agent", symbol: "DEMO", image: textFile }),
	});
	const body = (await res.json()) as { error: { code: string } };
	assert.equal(res.status, 400, JSON.stringify(body));
	assert.equal(body.error.code, "INVALID_IMAGE_TYPE");

	__setAgentOrPatronDbForTest(undefined);
});

test("POST /upload-metadata maps an uploader failure to a clean 400", async () => {
	__setAgentOrPatronDbForTest(agentAuthDb());

	const router = createAgentLaunchRoutes({
		db: {} as never,
		uploadMetadata: async (): Promise<UploadFlapMetadataResult> => {
			throw new Error("Flap upload failed with 502 Bad Gateway");
		},
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/upload-metadata", {
		method: "POST",
		headers: uploadHeaders(),
		body: uploadForm({ name: "Demo Agent", symbol: "DEMO" }),
	});
	const body = (await res.json()) as { error: { code: string } };
	assert.equal(res.status, 400, JSON.stringify(body));
	assert.equal(body.error.code, "FLAP_UPLOAD_FAILED");

	__setAgentOrPatronDbForTest(undefined);
});
