import assert from "node:assert/strict";
import test from "node:test";

import { type LaunchpadAdapter, type LaunchpadFeeConfig, bagsAdapter, bankrAdapter } from "@waifufun/launchpad";

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../middleware/patron-auth.js";
import { createV3Routes } from "./v3/index.js";

const OWNER = "0x00000000000000000000000000000000000000a1" as const;
const SAFE = "0x00000000000000000000000000000000000000b1" as const;
const MODIFIER = "0x00000000000000000000000000000000000000c1" as const;

function resetPatronAuthMocks() {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
}

function installCreatePatronAuth() {
	__setRequirePatronDbForTest({
		select() {
			return {
				from: () => ({
					where: () => ({
						limit: async () => [
							{
								id: "patron-1",
								stewardUserId: "steward-1",
								primaryEmail: null,
							},
						],
					}),
				}),
			};
		},
	} as never);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-1",
		tenantId: "waifu",
		address: OWNER,
	}));
}

test("POST /v3/agents creates a patron-owned persona and ignores caller-supplied IDs", async () => {
	installCreatePatronAuth();
	test.after(resetPatronAuthMocks);

	const inserted: unknown[] = [];
	const app = createV3Routes({
		db: {
			insert() {
				return {
					values(input: unknown) {
						inserted.push(input);
						return {
							returning: async () => [{ id: "agent-uuid", ...(input as Record<string, unknown>) }],
						};
					},
				};
			},
		} as never,
	});

	const res = await app.request("/agents", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: JSON.stringify({
			agent_id: "waifu-demo",
			name: "Demo",
			launchpad_id: "four-meme-tax",
			launchpad_config: { kind: "four-meme-tax" },
			chain: "bsc",
		}),
	});

	assert.equal(res.status, 201);
	const json = (await res.json()) as { ok: boolean; agent: Record<string, unknown> };
	assert.equal(json.ok, true);
	assert.equal(json.agent.launchpadId, "four-meme-tax");
	const createdAgentId = (inserted[0] as { agentId: string }).agentId;
	assert.match(createdAgentId, /^waifu-aed96123ee-demo-[0-9a-f]{8}$/);
	assert.notEqual(createdAgentId, "waifu-demo");
	assert.deepEqual(inserted[0], {
		agentId: createdAgentId,
		ownerStewardUserId: "steward-1",
		ownerAddress: OWNER,
		name: "Demo",
		bio: null,
		avatarUrl: null,
		launchpadId: "four-meme-tax",
		launchpadConfig: { kind: "four-meme-tax" },
		chain: "bsc",
		metadata: null,
	});
});

test("POST /v3/agents rejects anonymous persona creation", async () => {
	const app = createV3Routes({ db: {} as never });
	const res = await app.request("/agents", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "Demo", chain: "bsc" }),
	});
	assert.equal(res.status, 401);
});

test("GET /v3/agents/:id/safe returns safe metadata", async () => {
	const safe = {
		id: "safe-1",
		agentId: "agent-uuid",
		chain: "bsc",
		safeAddress: "0x0000000000000000000000000000000000000001",
		zodiacModifierAddress: "0x0000000000000000000000000000000000000002",
		rolesModifierAddress: "0x0000000000000000000000000000000000000002",
		agentRoleId: "agent-role",
		patronRoleId: "patron-role",
	};
	const app = createV3Routes({
		db: {
			select() {
				return { from: () => ({ where: () => ({ limit: async () => [safe] }) }) };
			},
		} as never,
	});

	const res = await app.request("/agents/agent-uuid/safe?chain=bsc");
	assert.equal(res.status, 200);
	const json = (await res.json()) as { ok: boolean; safe: typeof safe & { autonomy: unknown } };
	assert.equal(json.ok, true);
	assert.equal(json.safe.safeAddress, safe.safeAddress);
	assert.deepEqual(json.safe.autonomy, {
		zodiacModifierAddress: safe.zodiacModifierAddress,
		rolesModifierAddress: safe.rolesModifierAddress,
		agentRoleId: "agent-role",
		patronRoleId: "patron-role",
	});
});

test("POST /v3/agents rejects unsupported chains", async () => {
	installCreatePatronAuth();
	test.after(resetPatronAuthMocks);

	const app = createV3Routes({ db: {} as never });
	const res = await app.request("/agents", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: JSON.stringify({ name: "Demo", chain: "arbitrum" }),
	});
	assert.equal(res.status, 400);
});

test("POST /v3/agents/:id/launch deploys a Safe, applies platform cut default, and returns a plan", async () => {
	const persona = {
		id: "11111111-1111-1111-1111-111111111111",
		agentId: "waifu-demo",
		name: "Demo",
		bio: "demo agent",
		avatarUrl: "https://example.com/demo.png",
		launchpadId: "four-meme-tax",
		launchpadConfig: {
			kind: "four-meme-tax",
			taxBps: 300,
			allocation: { founderBps: 4000, holderBps: 2000, burnBps: 750, liquidityBps: 750 },
			minHolderBalance: "1000000000000000000",
		},
		chain: "bsc",
		ownerStewardUserId: "steward-1",
		ownerAddress: OWNER.toLowerCase(),
		tokenAddress: null,
	};
	const updates: Record<string, unknown>[] = [];
	const insertedSafes: Record<string, unknown>[] = [];
	const selectResults = [
		[{ id: "patron-1", stewardUserId: "steward-1", primaryEmail: null }],
		[persona],
		[persona],
		[],
	];
	const db = {
		select() {
			return {
				from: () => ({ where: () => ({ limit: async () => selectResults.shift() ?? [] }) }),
			};
		},
		insert() {
			return {
				values(input: Record<string, unknown>) {
					insertedSafes.push(input);
					return {
						onConflictDoUpdate() {
							return {
								returning: async () => [
									{
										id: "safe-row",
										...input,
										deployedAt: new Date("2026-04-30T00:00:00.000Z"),
									},
								],
							};
						},
						returning: async () => [{ id: "inserted", ...input }],
					};
				},
			};
		},
		update() {
			return {
				set(input: Record<string, unknown>) {
					updates.push(input);
					return { where: () => ({ returning: async () => [{ ...persona, ...input }] }) };
				},
			};
		},
	} as never;
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-1",
		tenantId: "waifu",
		address: OWNER,
	}));
	test.after(resetPatronAuthMocks);

	let adapterFeeConfig: LaunchpadFeeConfig | undefined;
	const adapter: LaunchpadAdapter = {
		descriptor: {
			id: "four-meme-tax",
			status: "live",
			chain: "bsc",
			displayName: "mock tax",
			shortDescription: "mock",
			feeSummary: "mock",
			graduationTarget: "mock",
		},
		getDefaultFeeConfig: () => ({
			kind: "four-meme-tax",
			taxBps: 300,
			platformCutBps: 2500,
			allocation: { founderBps: 4000, holderBps: 2000, burnBps: 750, liquidityBps: 750 },
			minHolderBalance: "1000000000000000000",
		}),
		validateFeeConfig(config) {
			adapterFeeConfig = config;
			return { ok: config.kind === "four-meme-tax" && config.platformCutBps === 2500, errors: [] };
		},
		buildCreateTokenTx: async (params) => {
			assert.equal(params.founderAddress, SAFE);
			assert.equal(params.feeConfig.kind, "four-meme-tax");
			return {
				to: "0x00000000000000000000000000000000000000d1",
				data: "0x1234",
				value: 0n,
				chainId: 56,
			};
		},
		parseCreateTokenReceipt: () => ({ tokenAddress: SAFE, curveAddress: SAFE }),
		getCurveProgress: async () => ({ raisedWei: 0n, targetWei: 1n }),
		getGraduationStatus: async () => ({ graduated: false }),
		getTradeFeeBps: async () => 300,
		getTreasuryAddress: async () => SAFE,
	};
	const app = createV3Routes({
		db,
		getLaunchpadAdapter: () => adapter,
		deployAgentSafe: async () => ({
			safeAddress: SAFE,
			modifierAddress: MODIFIER,
			agentRoleId: "0xagent" as `0x${string}`,
			patronRoleId: "0xpatron" as `0x${string}`,
		}),
	});

	const res = await app.request("/agents/waifu-demo/launch", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: JSON.stringify({ ticker: "DEMO" }),
	});

	assert.equal(res.status, 200);
	const json = (await res.json()) as {
		ok: boolean;
		launchPlan: { feeConfig: { platformCutBps: number }; tx: { value: string } };
	};
	assert.equal(json.ok, true);
	assert.equal(json.launchPlan.feeConfig.platformCutBps, 2500);
	assert.equal(json.launchPlan.tx.value, "0");
	assert.equal(adapterFeeConfig?.kind, "four-meme-tax");
	assert.equal(insertedSafes[0]?.safeAddress, SAFE);
	assert.equal(updates[0]?.agentLaunchStatus, "prepared");
});

test("POST /v3/agents/:id/launch rejects invalid production fee config before Safe deploy", async () => {
	const persona = {
		id: "11111111-1111-1111-1111-111111111111",
		agentId: "waifu-demo",
		name: "Demo",
		bio: null,
		avatarUrl: "https://example.com/demo.png",
		launchpadId: "four-meme-tax",
		launchpadConfig: { kind: "four-meme-tax" },
		chain: "bsc",
		ownerStewardUserId: "steward-1",
		ownerAddress: OWNER.toLowerCase(),
		tokenAddress: null,
	};
	const selectResults = [[{ id: "patron-1", stewardUserId: "steward-1" }], [persona], [persona]];
	const db = {
		select() {
			return {
				from: () => ({ where: () => ({ limit: async () => selectResults.shift() ?? [] }) }),
			};
		},
	} as never;
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-1",
		tenantId: "waifu",
		address: OWNER,
	}));
	test.after(resetPatronAuthMocks);

	let deployed = false;
	const adapter: LaunchpadAdapter = {
		descriptor: {
			id: "four-meme-tax",
			status: "live",
			chain: "bsc",
			displayName: "mock tax",
			shortDescription: "mock",
			feeSummary: "mock",
			graduationTarget: "mock",
		},
		getDefaultFeeConfig: () => ({
			kind: "four-meme-tax",
			taxBps: 300,
			platformCutBps: 2500,
			allocation: { founderBps: 4000, holderBps: 2000, burnBps: 750, liquidityBps: 750 },
			minHolderBalance: "1000000000000000000",
		}),
		validateFeeConfig: () => ({ ok: false, errors: ["taxBps must be greater than 0 in prod"] }),
		buildCreateTokenTx: async () => {
			throw new Error("should not build");
		},
		parseCreateTokenReceipt: () => ({ tokenAddress: SAFE, curveAddress: SAFE }),
		getCurveProgress: async () => ({ raisedWei: 0n, targetWei: 1n }),
		getGraduationStatus: async () => ({ graduated: false }),
		getTradeFeeBps: async () => 300,
		getTreasuryAddress: async () => SAFE,
	};
	const app = createV3Routes({
		db,
		getLaunchpadAdapter: () => adapter,
		deployAgentSafe: async () => {
			deployed = true;
			throw new Error("should not deploy");
		},
	});

	const res = await app.request("/agents/waifu-demo/launch", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: JSON.stringify({ ticker: "DEMO" }),
	});

	assert.equal(res.status, 400);
	const json = (await res.json()) as { error: string; details: string[] };
	assert.equal(json.error, "invalid feeConfig");
	assert.equal(json.details[0], "taxBps must be greater than 0 in prod");
	assert.equal(deployed, false);
});

test("POST /v3/agents/:id/launch prepares Bankr and Bags plans without BSC Safe deployment", async () => {
	test.after(resetPatronAuthMocks);
	for (const scenario of [
		{
			id: "bankr",
			chain: "base",
			adapter: bankrAdapter,
			body: { ticker: "BANKR", launch_wallet: OWNER },
			expectExternal: "bankr",
			expectFounder: OWNER,
		},
		{
			id: "bags",
			chain: "solana",
			adapter: bagsAdapter,
			body: { ticker: "BAGS", launch_wallet: "So11111111111111111111111111111111111111112" },
			expectExternal: "bags",
			expectFounder: "So11111111111111111111111111111111111111112",
		},
	] as const) {
		const persona = {
			id: `11111111-1111-1111-1111-11111111111${scenario.id === "bankr" ? "2" : "3"}`,
			agentId: `waifu-${scenario.id}`,
			name: `${scenario.id} Demo`,
			bio: "demo agent",
			avatarUrl: "https://example.com/demo.png",
			launchpadId: scenario.id,
			launchpadConfig: { kind: scenario.id },
			chain: scenario.chain,
			ownerStewardUserId: "steward-1",
			ownerAddress: OWNER.toLowerCase(),
			tokenAddress: null,
		};
		const updates: Record<string, unknown>[] = [];
		const selectResults = [[{ id: "patron-1", stewardUserId: "steward-1" }], [persona], [persona]];
		const db = {
			select() {
				return {
					from: () => ({ where: () => ({ limit: async () => selectResults.shift() ?? [] }) }),
				};
			},
			insert() {
				throw new Error("should not insert a BSC Safe for external launchpads");
			},
			update() {
				return {
					set(input: Record<string, unknown>) {
						updates.push(input);
						return { where: () => ({ returning: async () => [{ ...persona, ...input }] }) };
					},
				};
			},
		} as never;
		__setRequirePatronDbForTest(db);
		__setRequirePatronStewardParserForTest(async () => ({
			userId: "steward-1",
			tenantId: "waifu",
			address: OWNER,
		}));

		const app = createV3Routes({
			db,
			getLaunchpadAdapter: (id) => (id === scenario.id ? scenario.adapter : undefined),
			deployAgentSafe: async () => {
				throw new Error("should not deploy Safe for external launchpads");
			},
		});

		const res = await app.request(`/agents/${persona.agentId}/launch`, {
			method: "POST",
			headers: { authorization: "Bearer test", "content-type": "application/json" },
			body: JSON.stringify(scenario.body),
		});

		assert.equal(res.status, 200, `${scenario.id} launch should prepare`);
		const json = (await res.json()) as {
			ok: boolean;
			safe: unknown;
			launchPlan: {
				chain: string;
				safeAddress: string | null;
				tx: { external?: { kind: string } };
			};
		};
		assert.equal(json.ok, true);
		assert.equal(json.safe, null);
		assert.equal(json.launchPlan.chain, scenario.chain);
		assert.equal(json.launchPlan.safeAddress, null);
		assert.equal(json.launchPlan.tx.external?.kind, scenario.expectExternal);
		const prelaunchParams = updates[0]?.prelaunchParams as { founderAddress?: string };
		assert.equal(prelaunchParams?.founderAddress?.toLowerCase(), scenario.expectFounder.toLowerCase());
	}
	resetPatronAuthMocks();
});

test("PATCH /v3/agents/:id/autonomy returns patron-signable role txs", async () => {
	const persona = {
		id: "11111111-1111-1111-1111-111111111111",
		agentId: "waifu-demo",
		name: "Demo",
		bio: null,
		avatarUrl: null,
		launchpadId: "four-meme-tax",
		launchpadConfig: null,
		chain: "bsc",
		ownerStewardUserId: "steward-1",
		ownerAddress: OWNER.toLowerCase(),
		tokenAddress: null,
	};
	const safe = {
		id: "safe-row",
		agentId: persona.id,
		chain: "bsc",
		safeAddress: SAFE,
		zodiacModifierAddress: MODIFIER,
		rolesModifierAddress: MODIFIER,
		agentRoleId: "agent-role",
		patronRoleId: "patron-role",
	};
	const selectResults = [[{ id: "patron-1", stewardUserId: "steward-1" }], [persona], [persona], [safe]];
	const db = {
		select() {
			return {
				from: () => ({ where: () => ({ limit: async () => selectResults.shift() ?? [] }) }),
			};
		},
	} as never;
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-1",
		tenantId: "waifu",
		address: OWNER,
	}));
	test.after(resetPatronAuthMocks);

	const app = createV3Routes({ db });
	const res = await app.request("/agents/waifu-demo/autonomy", {
		method: "PATCH",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: JSON.stringify({ maxTradesPer24h: 4 }),
	});

	assert.equal(res.status, 200);
	const json = (await res.json()) as {
		ok: boolean;
		transactions: Array<{ to: string; value: string }>;
	};
	assert.equal(json.ok, true);
	assert.ok(json.transactions.length > 0);
	assert.equal(json.transactions[0]?.to.toLowerCase(), MODIFIER.toLowerCase());
	assert.equal(json.transactions[0]?.value, "0");
});
