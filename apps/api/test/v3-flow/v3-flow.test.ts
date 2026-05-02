import assert from "node:assert/strict";
import test from "node:test";

import type { LaunchpadAdapter, LaunchpadFeeConfig } from "@waifufun/launchpad";

import {
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../../src/middleware/patron-auth.js";
import { createV3Routes } from "../../src/routes/v3/index.js";

const OWNER = "0x00000000000000000000000000000000000000a1" as const;
const SAFE = "0x00000000000000000000000000000000000000b1" as const;
const MODIFIER = "0x00000000000000000000000000000000000000c1" as const;
const TOKEN_FACTORY = "0x00000000000000000000000000000000000000d1" as const;

function resetPatronAuthMocks() {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
}

function makeFourMemeTaxAdapter(overrides: Partial<LaunchpadAdapter> = {}): LaunchpadAdapter {
	const adapter: LaunchpadAdapter = {
		descriptor: {
			id: "four-meme-tax",
			status: "live",
			chain: "bsc",
			displayName: "Four.Meme Tax",
			shortDescription: "mock tax launchpad",
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
		validateFeeConfig: (config) => ({
			ok: config.kind === "four-meme-tax" && typeof config.platformCutBps === "number" && config.taxBps > 0,
			errors:
				config.kind === "four-meme-tax" && typeof config.platformCutBps === "number" && config.taxBps > 0
					? []
					: ["invalid mock feeConfig"],
		}),
		buildCreateTokenTx: async (params) => {
			assert.equal(params.founderAddress, SAFE);
			return { to: TOKEN_FACTORY, data: "0x1234", value: 0n, chainId: 56 };
		},
		parseCreateTokenReceipt: () => ({ tokenAddress: SAFE, curveAddress: SAFE }),
		getCurveProgress: async () => ({ raisedWei: 0n, targetWei: 1n }),
		getGraduationStatus: async () => ({ graduated: false }),
		getTradeFeeBps: async () => 300,
		getTreasuryAddress: async () => SAFE,
		...overrides,
	};
	return adapter;
}

test("v3 launchpad picker defaults validate, reject prod bounds, and feed POST /v3/agents", async () => {
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

	const descriptorRes = await app.request("/launchpads/four-meme-tax");
	assert.equal(descriptorRes.status, 200);
	const descriptorJson = (await descriptorRes.json()) as {
		data: { descriptor: { id: string }; defaultFeeConfig: LaunchpadFeeConfig };
	};
	assert.equal(descriptorJson.data.descriptor.id, "four-meme-tax");
	assert.equal(descriptorJson.data.defaultFeeConfig.kind, "four-meme-tax");

	const validRes = await app.request("/launchpads/four-meme-tax/validate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ env: "prod", feeConfig: descriptorJson.data.defaultFeeConfig }),
	});
	assert.equal(validRes.status, 200);
	assert.deepEqual((await validRes.json()) as unknown, {
		ok: true,
		data: { ok: true, errors: [] },
	});

	const invalidRes = await app.request("/launchpads/four-meme-tax/validate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			env: "prod",
			feeConfig: { ...descriptorJson.data.defaultFeeConfig, taxBps: 200 },
		}),
	});
	assert.equal(invalidRes.status, 200);
	const invalidJson = (await invalidRes.json()) as { data: { ok: boolean; errors: string[] } };
	assert.equal(invalidJson.data.ok, false);
	assert.ok(invalidJson.data.errors.length > 0);

	const createRes = await app.request("/agents", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			agent_id: "waifu-picker-flow",
			name: "Picker Flow",
			chain: "bsc",
			launchpad_id: "four-meme-tax",
			launchpad_config: { kind: "four-meme-tax", feeConfig: descriptorJson.data.defaultFeeConfig },
			metadata: { provisionedFrom: "launchpad-picker" },
		}),
	});
	assert.equal(createRes.status, 201);
	assert.deepEqual(inserted[0], {
		agentId: "waifu-picker-flow",
		name: "Picker Flow",
		bio: null,
		avatarUrl: null,
		launchpadId: "four-meme-tax",
		launchpadConfig: { kind: "four-meme-tax", feeConfig: descriptorJson.data.defaultFeeConfig },
		chain: "bsc",
		metadata: { provisionedFrom: "launchpad-picker" },
	});
});

test("v3 launch flow prepares Safe-backed plan and exposes safe/autonomy shapes", async () => {
	const persona = {
		id: "11111111-1111-1111-1111-111111111111",
		agentId: "waifu-launch-flow",
		name: "Launch Flow",
		bio: "integration test agent",
		avatarUrl: "https://example.com/logo.png",
		launchpadId: "four-meme-tax",
		launchpadConfig: { kind: "four-meme-tax" },
		chain: "bsc",
		ownerStewardUserId: "steward-1",
		ownerAddress: OWNER.toLowerCase(),
		tokenAddress: null,
	};
	const selectResults = [
		[{ id: "patron-1", stewardUserId: "steward-1", primaryEmail: null }],
		[persona],
		[persona],
		[],
		[persona],
		[
			{
				id: "safe-row",
				agentId: persona.id,
				chain: "bsc",
				safeAddress: SAFE,
				zodiacModifierAddress: MODIFIER,
				rolesModifierAddress: MODIFIER,
				agentRoleId: "agent-role",
				patronRoleId: "patron-role",
			},
		],
		[{ id: "patron-1", stewardUserId: "steward-1", primaryEmail: null }],
		[persona],
		[persona],
		[
			{
				id: "safe-row",
				agentId: persona.id,
				chain: "bsc",
				safeAddress: SAFE,
				zodiacModifierAddress: MODIFIER,
				rolesModifierAddress: MODIFIER,
				agentRoleId: "agent-role",
				patronRoleId: "patron-role",
			},
		],
	];
	const updates: Record<string, unknown>[] = [];
	const insertedSafes: Record<string, unknown>[] = [];
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
										deployedAt: new Date("2026-05-01T00:00:00.000Z"),
									},
								],
							};
						},
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

	let validatedConfig: LaunchpadFeeConfig | undefined;
	const app = createV3Routes({
		db,
		getLaunchpadAdapter: () =>
			makeFourMemeTaxAdapter({
				validateFeeConfig(config) {
					validatedConfig = config;
					return { ok: true, errors: [] };
				},
			}),
		deployAgentSafe: async () => ({
			safeAddress: SAFE,
			modifierAddress: MODIFIER,
			agentRoleId: "0xagent" as `0x${string}`,
			patronRoleId: "0xpatron" as `0x${string}`,
		}),
	});

	const launchRes = await app.request("/agents/waifu-launch-flow/launch", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: JSON.stringify({ ticker: "FLOW", initialBuyBnb: "0" }),
	});
	assert.equal(launchRes.status, 200);
	const launchJson = (await launchRes.json()) as {
		ok: boolean;
		launchPlan: {
			safeAddress: string;
			tx: { to: string; value: string };
			feeConfig: LaunchpadFeeConfig;
		};
		safe: { safeAddress: string; autonomy: { rolesModifierAddress: string } };
	};
	assert.equal(launchJson.ok, true);
	assert.equal(launchJson.launchPlan.safeAddress, SAFE);
	assert.equal(launchJson.launchPlan.tx.to, TOKEN_FACTORY);
	assert.equal(launchJson.launchPlan.tx.value, "0");
	assert.equal(launchJson.safe.autonomy.rolesModifierAddress, MODIFIER);
	assert.equal(validatedConfig?.kind, "four-meme-tax");
	assert.equal(insertedSafes[0]?.safeAddress, SAFE);
	assert.equal(updates[0]?.agentLaunchStatus, "prepared");

	const safeRes = await app.request("/agents/waifu-launch-flow/safe?chain=bsc");
	assert.equal(safeRes.status, 200);
	const safeJson = (await safeRes.json()) as { safe: { safeAddress: string; autonomy: unknown } };
	assert.equal(safeJson.safe.safeAddress, SAFE);
	assert.ok(safeJson.safe.autonomy);

	const autonomyRes = await app.request("/agents/waifu-launch-flow/autonomy", {
		method: "PATCH",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: JSON.stringify({ maxTradesPer24h: 3, chain: "bsc" }),
	});
	assert.equal(autonomyRes.status, 200);
	const autonomyJson = (await autonomyRes.json()) as {
		ok: boolean;
		transactions: Array<{ to: string; value: string }>;
	};
	assert.equal(autonomyJson.ok, true);
	assert.ok(autonomyJson.transactions.length > 0);
	assert.equal(autonomyJson.transactions[0]?.to.toLowerCase(), MODIFIER.toLowerCase());
	assert.equal(autonomyJson.transactions[0]?.value, "0");
});

test("v3 launch returns graceful errors for Safe deploy and adapter tx build failures", async () => {
	const persona = {
		id: "22222222-2222-2222-2222-222222222222",
		agentId: "waifu-sad-flow",
		name: "Sad Flow",
		bio: "integration test agent",
		avatarUrl: "https://example.com/logo.png",
		launchpadId: "four-meme-tax",
		launchpadConfig: { kind: "four-meme-tax" },
		chain: "bsc",
		ownerStewardUserId: "steward-1",
		ownerAddress: OWNER.toLowerCase(),
		tokenAddress: null,
	};

	async function runLaunch(selectResults: unknown[][], appOverrides: Parameters<typeof createV3Routes>[0]) {
		const db = {
			select() {
				return {
					from: () => ({ where: () => ({ limit: async () => selectResults.shift() ?? [] }) }),
				};
			},
			insert() {
				return {
					values(input: Record<string, unknown>) {
						return {
							onConflictDoUpdate() {
								return { returning: async () => [{ id: "safe-row", ...input }] };
							},
						};
					},
				};
			},
			update() {
				return { set: () => ({ where: () => ({ returning: async () => [persona] }) }) };
			},
		} as never;
		__setRequirePatronDbForTest(db);
		__setRequirePatronStewardParserForTest(async () => ({
			userId: "steward-1",
			tenantId: "waifu",
			address: OWNER,
		}));
		const app = createV3Routes({ db, ...appOverrides });
		return app.request("/agents/waifu-sad-flow/launch", {
			method: "POST",
			headers: { authorization: "Bearer test", "content-type": "application/json" },
			body: JSON.stringify({ ticker: "SAD" }),
		});
	}

	const deployFailRes = await runLaunch([[{ id: "patron-1", stewardUserId: "steward-1" }], [persona], [persona], []], {
		getLaunchpadAdapter: () => makeFourMemeTaxAdapter(),
		deployAgentSafe: async () => {
			throw new Error("SAFE_DEPLOYMENT_FUNDER_PK is not configured");
		},
	});
	assert.equal(deployFailRes.status, 502);
	const deployFailJson = (await deployFailRes.json()) as { error: string; message: string };
	assert.equal(deployFailJson.error, "safe deploy failed");
	assert.match(deployFailJson.message, /SAFE_DEPLOYMENT_FUNDER_PK/);

	const txBuildFailRes = await runLaunch(
		[
			[{ id: "patron-1", stewardUserId: "steward-1" }],
			[persona],
			[persona],
			[
				{
					id: "safe-row",
					agentId: persona.id,
					chain: "bsc",
					safeAddress: SAFE,
					zodiacModifierAddress: MODIFIER,
					rolesModifierAddress: MODIFIER,
					agentRoleId: "agent-role",
					patronRoleId: "patron-role",
				},
			],
		],
		{
			getLaunchpadAdapter: () =>
				makeFourMemeTaxAdapter({
					buildCreateTokenTx: async () => {
						throw new Error("adapter tx build rejected payload");
					},
				}),
		},
	);
	assert.equal(txBuildFailRes.status, 400);
	const txBuildFailJson = (await txBuildFailRes.json()) as { error: string; message: string };
	assert.equal(txBuildFailJson.error, "launch transaction build failed");
	assert.match(txBuildFailJson.message, /adapter tx build/);
	resetPatronAuthMocks();
});

test("v3 waitlist returns 201 for first insert and duplicate/idempotent resubmission", async () => {
	let insertCount = 0;
	const app = createV3Routes({
		db: {
			insert() {
				return {
					values(input: unknown) {
						insertCount += 1;
						return {
							onConflictDoNothing() {
								return {
									returning: async () =>
										insertCount === 1 ? [{ id: "wait-1", ...(input as Record<string, unknown>) }] : [],
								};
							},
						};
					},
				};
			},
			select(selection?: unknown) {
				if (selection) return { from: () => ({ where: async () => [{ count: 1 }] }) };
				return {
					from: () => ({
						where: () => ({
							limit: async () => [{ id: "wait-1", email: "fan@example.com", launchpadId: "pump-fun" }],
						}),
					}),
				};
			},
		} as never,
	});

	for (const expectedEmail of ["fan@example.com", "fan@example.com"]) {
		const res = await app.request("/launchpads/pump-fun/waitlist", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: " Fan@Example.com " }),
		});
		assert.equal(res.status, 201);
		const json = (await res.json()) as { ok: boolean; waitlist: { email: string }; count: number };
		assert.equal(json.ok, true);
		assert.equal(json.waitlist.email, expectedEmail);
		assert.equal(json.count, 1);
	}
});
