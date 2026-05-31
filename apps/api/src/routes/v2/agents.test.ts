import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db";

import { hashKey } from "../../lib/agent-keys.js";
import { __setAgentAuthDbForTest } from "../../middleware/agent-auth.js";
import { redeemProvisionInviteCode, resurrectAgent } from "./agents.js";

test("resurrectAgent tops up credits, clears dormant fields, and emits resurrection", async () => {
	const updates: unknown[] = [];
	const wheres: unknown[] = [];
	const toppedUp: unknown[] = [];
	const resumed: unknown[] = [];
	const emitted: unknown[] = [];
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve([
										{
											metadata: {
												provisioning: {
													cloudAgentId: "cloud-waifu-demo-01",
													containerId: "container-1",
												},
											},
											tokenAddress: null,
										},
									]);
								},
							};
						},
					};
				},
			};
		},
		update(table: unknown) {
			return {
				set(values: unknown) {
					updates.push({ table, values });
					return {
						where(condition: unknown) {
							wheres.push(condition);
							return Promise.resolve();
						},
					};
				},
			};
		},
	} as never;

	const result = await resurrectAgent("waifu-demo-01", 2500, {
		db,
		elizaClient: {
			async topUpCredits(agentId, amount) {
				toppedUp.push({ agentId, amount });
				return undefined;
			},
			async resumeAgent(agentId) {
				resumed.push(agentId);
			},
		},
		async emitEvent(input) {
			emitted.push(input);
			return {} as Awaited<ReturnType<NonNullable<Parameters<typeof resurrectAgent>[2]["emitEvent"]>>>;
		},
	});

	assert.deepEqual(result, {
		agentId: "waifu-demo-01",
		creditsAmount: 2500,
		modelTier: "premium",
		containerId: "cloud-waifu-demo-01",
	});
	assert.deepEqual(toppedUp, [{ agentId: "cloud-waifu-demo-01", amount: 25 }]);
	assert.deepEqual(resumed, ["cloud-waifu-demo-01"]);
	assert.equal(updates.length, 1);
	const values = (updates[0] as { values: Record<string, unknown> }).values;
	assert.equal(values.dormantAt, null);
	assert.equal(values.brainPausedAt, null);
	assert.equal(values.lastWordsPostedAt, null);
	assert.equal(values.modelTier, "premium");
	assert.equal(wheres.length, 1);
	assert.equal((emitted[0] as { eventType: string }).eventType, "agent.resurrected");
});

test("resurrectAgent marks overlays live only after resumed runtime exposes hosted URL evidence", async () => {
	const makeDb = () => {
		const updates: Record<string, unknown>[] = [];
		let selectCount = 0;
		return {
			updates,
			db: {
				select() {
					selectCount += 1;
					return {
						from() {
							return {
								leftJoin() {
									return this;
								},
								where() {
									return {
										limit() {
											if (selectCount === 1) {
												return Promise.resolve([
													{
														metadata: {
															provisioning: {
																cloudAgentId: "cloud-waifu-demo-01",
																containerId: "container-before-resume",
															},
														},
														tokenAddress: "0x0000000000000000000000000000000000000004",
													},
												]);
											}
											return Promise.resolve([
												{
													tokenId: "token-row-1",
													overlayAgentId: "agent-row-1",
													containerId: "container-before-resume",
													cloudAgentId: "cloud-waifu-demo-01",
												},
											]);
										},
									};
								},
							};
						},
					};
				},
				update() {
					return {
						set(values: Record<string, unknown>) {
							updates.push(values);
							return {
								where() {
									return Promise.resolve();
								},
							};
						},
					};
				},
			} as never,
		};
	};

	const pending = makeDb();
	await resurrectAgent("waifu-demo-01", 2500, {
		db: pending.db,
		elizaClient: {
			async topUpCredits() {
				return undefined;
			},
			async resumeAgent() {},
			async getAgentRuntimeStatus() {
				return { status: "running", containerId: "container-after-resume" };
			},
		},
		async emitEvent() {
			return {} as never;
		},
	});
	assert.equal(pending.updates[1]?.agentStatus, "provisioning");
	assert.equal(pending.updates[1]?.lifecycleState, "birth");
	assert.equal(pending.updates[1]?.bridgeUrl, "container-after-resume");
	assert.equal(pending.updates[2]?.agentStatus, "provisioning");

	const live = makeDb();
	await resurrectAgent("waifu-demo-01", 2500, {
		db: live.db,
		elizaClient: {
			async topUpCredits() {
				return undefined;
			},
			async resumeAgent() {},
			async getAgentRuntimeStatus() {
				return {
					status: "running",
					containerId: "container-after-resume",
					webUiUrl: "https://agent-after-resume.example",
				};
			},
		},
		async emitEvent() {
			return {} as never;
		},
	});
	assert.equal(live.updates[1]?.agentStatus, "running");
	assert.equal(live.updates[1]?.lifecycleState, "live");
	assert.equal(live.updates[1]?.webUiUrl, "https://agent-after-resume.example");
	assert.equal(live.updates[2]?.agentStatus, "running");
});

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../../middleware/patron-auth.js";
import app, { __setAgentsRouteDepsForTest, buildLaunchOrchestratorDeps } from "./agents.js";

const PATRON_ROW = {
	id: "patron-row-1",
	stewardUserId: "steward-user-1",
	primaryEmail: "patron@example.com",
};

function provisionPayload() {
	return {
		inviteCode: "W18TEST",
		persona: {
			name: "Test Waifu",
			ticker: "TEST",
			bio: "a test agent for provision",
			personaPrompt: "be useful",
			avatarTemplateId: "tessera",
			hasAvatarUpload: false,
		},
		runtime: { kind: "webhook", webhookUrl: "https://example.com/hook", webhookSecret: "secret" },
		safe: {
			taxAgentBps: 8000,
			taxPatronBps: 2000,
			owners: ["0x0000000000000000000000000000000000000001"],
			threshold: 1,
			firstBuyFundingSource: null,
			adapters: [{ slug: "pancake", enabled: true }],
		},
	};
}

function createInviteRedemptionDb() {
	const state = {
		currentStewardUserId: "steward-user-1",
		invite: { id: "invite-1", maxUses: 1, usedCount: 0, isActive: true, expiresAt: null as Date | null },
		creators: new Map<string, { id: string }>(),
		redemptions: new Set<string>(),
	};
	const db = {
		transaction<T>(fn: (tx: unknown) => Promise<T>) {
			let selectCount = 0;
			let executeCount = 0;
			const tx = {
				select() {
					selectCount += 1;
					return {
						from() {
							return {
								where() {
									return {
										limit() {
											if (selectCount === 1)
												return Promise.resolve(
													state.creators.get(state.currentStewardUserId)
														? [state.creators.get(state.currentStewardUserId)]
														: [],
												);
											const creator = state.creators.get(state.currentStewardUserId);
											return Promise.resolve(
												creator && state.redemptions.has(`${state.invite.id}:${creator.id}`)
													? [{ creatorId: creator.id }]
													: [],
											);
										},
									};
								},
							};
						},
					};
				},
				execute() {
					executeCount += 1;
					if (executeCount === 2) return Promise.resolve([{ pendingCount: state.redemptions.size }]);
					return Promise.resolve([state.invite]);
				},
				insert() {
					let values: Record<string, string | null> = {};
					return {
						values(input: Record<string, string | null>) {
							values = input;
							return this;
						},
						onConflictDoUpdate() {
							return this;
						},
						onConflictDoNothing() {
							return this;
						},
						returning() {
							if (typeof values.stewardUserId === "string") {
								const creator = { id: `creator-${values.stewardUserId}` };
								state.creators.set(values.stewardUserId, creator);
								return Promise.resolve([creator]);
							}
							const key = `${values.inviteCodeId}:${values.creatorId}`;
							if (state.redemptions.has(key)) return Promise.resolve([]);
							state.redemptions.add(key);
							return Promise.resolve([{ inviteCodeId: values.inviteCodeId }]);
						},
					};
				},
				update() {
					return {
						set: () => ({
							where: () => {
								state.invite.usedCount += 1;
								return Promise.resolve();
							},
						}),
					};
				},
				delete() {
					return {
						where: () => {
							const creator = state.creators.get(state.currentStewardUserId);
							if (creator) state.redemptions.delete(`${state.invite.id}:${creator.id}`);
							return Promise.resolve();
						},
					};
				},
			};
			return fn(tx);
		},
	};
	return { db: db as never, state };
}

type ProvisionDbForTest = Database & {
	__inviteState: {
		currentStewardUserId: string;
		invite: { maxUses: number; usedCount: number; isActive: boolean; expiresAt: Date | null };
		redemptions: Set<string>;
	};
	__updates: Array<Record<string, unknown>>;
	__inserts: Array<Record<string, unknown>>;
};

function createProvisionDb(
	duplicateRows: Array<{ agentId: string; taxRecipientAddress: string | null; tokenAddress: string | null }> = [],
	personaMetadata: Record<string, unknown> | null = null,
): ProvisionDbForTest {
	const inviteDb = createInviteRedemptionDb();
	const updates: Array<Record<string, unknown>> = [];
	const inserts: Array<Record<string, unknown>> = [];
	return {
		select(fields?: unknown) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (fields && typeof fields === "object" && "maxUses" in fields) {
										return Promise.resolve([inviteDb.state.invite]);
									}
									if (fields && typeof fields === "object" && "token" in fields) {
										return Promise.resolve([{ token: { id: "token-row-1", agentId: null }, agent: null }]);
									}
									if (fields && typeof fields === "object" && "taxRecipientAddress" in fields) {
										return Promise.resolve(duplicateRows);
									}
									return Promise.resolve([{ ...PATRON_ROW, metadata: personaMetadata }]);
								},
								orderBy() {
									return { limit: () => Promise.resolve(duplicateRows) };
								},
							};
						},
					};
				},
			};
		},
		insert() {
			return {
				values: (values: Record<string, unknown>) => {
					inserts.push(values);
					return {
						returning: () => Promise.resolve([{ id: "agent-row-1" }]),
					};
				},
			};
		},
		update() {
			return {
				set: (values: Record<string, unknown>) => ({
					where: () => {
						updates.push(values);
						return {
							returning: () => Promise.resolve([{ id: "patron-row-1", ...values }]),
						};
					},
				}),
			};
		},
		transaction: (inviteDb.db as { transaction: unknown }).transaction,
		__inviteState: inviteDb.state,
		__updates: updates,
		__inserts: inserts,
	} as unknown as ProvisionDbForTest;
}

function resetProvisionDeps() {
	__setAgentsRouteDepsForTest({});
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
	__setAgentAuthDbForTest(undefined);
}

test("GET /v2/agents/:token/apps returns registry rows and revenue totals", async () => {
	const rows = [
		{
			id: 1n,
			agentTokenAddress: "0x15fc6086064afe50ccf4c70000c55cecb6e17777",
			appId: "twitter-replies",
			name: "twitter replies",
			description: "Sol replies to mentions on @0xSolace_",
			icon: null,
			appUrl: null,
			status: "scheduled",
			shippedAt: null,
			revenueLifetimeUsd: "0",
			revenue24hUsd: "0",
			revenue7dUsd: "0",
			metadata: {},
			createdAt: new Date("2026-05-22T12:00:00Z"),
			updatedAt: new Date("2026-05-22T12:00:00Z"),
		},
		{
			id: 2n,
			agentTokenAddress: "0x15fc6086064afe50ccf4c70000c55cecb6e17777",
			appId: "live-demo",
			name: "live demo",
			description: null,
			icon: null,
			appUrl: "https://example.com",
			status: "live",
			shippedAt: new Date("2026-05-20T12:00:00Z"),
			revenueLifetimeUsd: "42.5",
			revenue24hUsd: "2.5",
			revenue7dUsd: "10.25",
			metadata: { revenue7dDeltaPct: 12.5 },
			createdAt: new Date("2026-05-19T12:00:00Z"),
			updatedAt: new Date("2026-05-22T12:00:00Z"),
		},
	];
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								orderBy() {
									return Promise.resolve(rows);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setAgentsRouteDepsForTest({ db });
	try {
		const res = await app.request("/0x15fc6086064afe50ccf4c70000c55cecb6e17777/apps");
		assert.equal(res.status, 200);
		assert.equal(res.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
		const body = (await res.json()) as {
			ok: boolean;
			data: {
				apps: Array<{ id: string; appId: string; revenue7dUsd: number }>;
				totalRevenue7d: number;
				totalLifetime: number;
			};
		};
		assert.equal(body.ok, true);
		assert.equal(body.data.apps.length, 2);
		assert.deepEqual(
			body.data.apps.map((appRow) => appRow.id),
			["2", "1"],
		);
		assert.equal(body.data.apps[0]?.revenue7dUsd, 10.25);
		assert.equal(body.data.totalRevenue7d, 10.25);
		assert.equal(body.data.totalLifetime, 42.5);
	} finally {
		resetProvisionDeps();
	}
});

test("GET /v2/agents/:token/apps returns an honest empty registry", async () => {
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								orderBy() {
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setAgentsRouteDepsForTest({ db });
	try {
		const res = await app.request("/0x0000000000000000000000000000000000000001/apps");
		assert.equal(res.status, 200);
		assert.deepEqual(await res.json(), { ok: true, data: { apps: [], totalRevenue7d: 0, totalLifetime: 0 } });
	} finally {
		resetProvisionDeps();
	}
});

test("buildLaunchOrchestratorDeps forwards tax splitter factory address", () => {
	const previous = {
		stewardUrl: process.env.STEWARD_API_URL,
		stewardKey: process.env.STEWARD_API_KEY,
		taxFactory: process.env.TAX_SPLITTER_FACTORY_ADDRESS,
	};
	process.env.STEWARD_API_URL = "https://steward.example";
	process.env.STEWARD_API_KEY = "steward-key";
	process.env.TAX_SPLITTER_FACTORY_ADDRESS = "0x00000000000000000000000000000000000000aa";
	try {
		const deps = buildLaunchOrchestratorDeps();
		assert.equal(deps.taxSplitterFactoryAddress, "0x00000000000000000000000000000000000000aa");
	} finally {
		if (previous.stewardUrl === undefined) delete process.env.STEWARD_API_URL;
		else process.env.STEWARD_API_URL = previous.stewardUrl;
		if (previous.stewardKey === undefined) delete process.env.STEWARD_API_KEY;
		else process.env.STEWARD_API_KEY = previous.stewardKey;
		if (previous.taxFactory === undefined) delete process.env.TAX_SPLITTER_FACTORY_ADDRESS;
		else process.env.TAX_SPLITTER_FACTORY_ADDRESS = previous.taxFactory;
	}
});

test("redeemProvisionInviteCode is idempotent per patron and enforces max uses", async () => {
	const { db, state } = createInviteRedemptionDb();

	state.currentStewardUserId = "patron-a";
	const first = await redeemProvisionInviteCode(db, "W18TEST", { stewardUserId: "patron-a" });
	assert.deepEqual(first, { redeemed: true, alreadyRedeemed: false });
	assert.equal(state.invite.usedCount, 1);

	const second = await redeemProvisionInviteCode(db, "W18TEST", { stewardUserId: "patron-a" });
	assert.deepEqual(second, { redeemed: false, alreadyRedeemed: true });
	assert.equal(state.invite.usedCount, 1);

	state.currentStewardUserId = "patron-b";
	await assert.rejects(
		redeemProvisionInviteCode(db, "W18TEST", { stewardUserId: "patron-b" }),
		/invite code has reached max uses/,
	);
	assert.equal(state.invite.usedCount, 1);
});

test("POST /v2/agents/provision rejects missing patron session", async () => {
	resetProvisionDeps();
	const res = await app.request("/provision", { method: "POST", body: JSON.stringify(provisionPayload()) });
	assert.equal(res.status, 401);
});

test("POST /v2/agents/provision rejects bad body", async () => {
	const db = createProvisionDb();
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
	}));
	__setAgentsRouteDepsForTest({ db });

	const res = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify({ inviteCode: "W18TEST" }),
	});

	assert.equal(res.status, 400);
	assert.equal(((await res.json()) as { reason?: string }).reason, "validation");
	resetProvisionDeps();
});

test("POST /v2/agents/provision launches as patron and returns one-time keys", async () => {
	const db = createProvisionDb();
	const launches: unknown[] = [];
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: "agk_test_key", row: { agentId } as never }),
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					return {
						agentId: input.agentId ?? "waifu-test-waifu",
						walletAddress: "0x0000000000000000000000000000000000000002",
						treasuryAddress: "0x0000000000000000000000000000000000000003",
						tokenAddress: "0x0000000000000000000000000000000000000004",
						txHash: `0x${"1".repeat(64)}`,
						fourMeme: { nonce: "n", imageUrl: "https://example.com/i.png", createArgHash: "h" },
					};
				},
			}) as never,
	});

	const res = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(provisionPayload()),
	});

	assert.equal(res.status, 200, await res.clone().text());
	const json = (await res.json()) as { agentApiKey?: string; safeAddress?: string };
	assert.equal(json.agentApiKey, "agk_test_key");
	assert.equal(json.safeAddress, "0x0000000000000000000000000000000000000003");
	assert.equal(launches.length, 1);
	assert.equal((launches[0] as { name: string }).name, "Test Waifu");
	const persona = (launches[0] as { persona?: Record<string, unknown> }).persona;
	assert.equal(typeof persona?.runtimeWebhookSecretHash, "string");
	assert.match(persona?.runtimeWebhookSecretHash as string, /^sha256:[a-f0-9]{64}$/);
	resetProvisionDeps();
});

test("POST /v2/agents/provision provisions hosted agents in Eliza Cloud", async () => {
	const db = createProvisionDb();
	const launches: unknown[] = [];
	const cloudInputs: unknown[] = [];
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: "agk_hosted_key", row: { agentId } as never }),
		elizaCloudClient: {
			async provisionWaifuAgent(input) {
				cloudInputs.push(input);
				return {
					agentId: input.agentId,
					cloudAgentId: "cloud-waifu-test-waifu",
					status: "queued",
					containerUrl: "http://internal-runtime.example",
					webUiUrl: "https://public-runtime.example",
					jobId: "job-1",
					polling: { endpoint: "/api/v1/agents/cloud-waifu-test-waifu", intervalMs: 2000, expectedDurationMs: 120000 },
					account: {
						primaryWalletAddress: input.account?.primaryWalletAddress ?? null,
						walletKeyRef: input.account?.walletKeyRef ?? null,
						initialFreeCreditsUsd: 5,
					},
				};
			},
		},
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					return {
						agentId: input.agentId ?? "waifu-test-waifu",
						walletAddress: "0x0000000000000000000000000000000000000002",
						treasuryAddress: "0x0000000000000000000000000000000000000003",
						tokenAddress: "0x0000000000000000000000000000000000000004",
						txHash: `0x${"1".repeat(64)}`,
						fourMeme: { nonce: "n", imageUrl: "https://example.com/i.png", createArgHash: "h" },
					};
				},
			}) as never,
	});

	const payload = provisionPayload();
	payload.runtime = { kind: "hosted" } as never;
	const res = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(payload),
	});

	assert.equal(res.status, 200, await res.clone().text());
	const json = (await res.json()) as {
		cloudAgentId?: string;
		cloudStatus?: string;
		webUiUrl?: string | null;
		cloud?: {
			provider?: string;
			agentId?: string;
			status?: string;
			webUiUrl?: string | null;
			account?: { walletKeyRef?: string | null };
		};
	};
	assert.equal(json.cloudAgentId, "cloud-waifu-test-waifu");
	assert.equal(json.cloudStatus, "queued");
	assert.equal(json.webUiUrl, "https://public-runtime.example");
	assert.equal(cloudInputs.length, 1);
	const provisionedAgentId = (cloudInputs[0] as { agentId?: string }).agentId;
	assert.equal(json.cloud?.account?.walletKeyRef, `steward:${provisionedAgentId}`);
	assert.deepEqual(json.cloud, {
		provider: "eliza-cloud",
		agentId: "cloud-waifu-test-waifu",
		containerId: null,
		containerUrl: "http://internal-runtime.example",
		webUiUrl: "https://public-runtime.example",
		status: "queued",
		jobId: "job-1",
		polling: { endpoint: "/api/v1/agents/cloud-waifu-test-waifu", intervalMs: 2000, expectedDurationMs: 120000 },
		characterId: null,
		account: {
			primaryWalletAddress: "0x0000000000000000000000000000000000000002",
			walletKeyRef: `steward:${provisionedAgentId}`,
			initialFreeCreditsUsd: 5,
		},
	});
	assert.equal(
		(cloudInputs[0] as { tokenContractAddress?: string }).tokenContractAddress,
		"0x0000000000000000000000000000000000000004",
	);
	assert.equal((cloudInputs[0] as { access?: { thresholdMode?: string } }).access?.thresholdMode, "strict_gt");
	assert.equal(
		(cloudInputs[0] as { account?: { primaryWalletAddress?: string | null } }).account?.primaryWalletAddress,
		"0x0000000000000000000000000000000000000002",
	);
	assert.equal(
		(cloudInputs[0] as { account?: { walletKeyRef?: string | null } }).account?.walletKeyRef,
		`steward:${provisionedAgentId}`,
	);
	const overlay =
		db.__updates.find((values) => values.cloudAgentId === "cloud-waifu-test-waifu") ??
		db.__inserts.find((values) => values.cloudAgentId === "cloud-waifu-test-waifu");
	assert.equal(overlay?.webUiUrl, "https://public-runtime.example");
	assert.equal(overlay?.bridgeUrl, "http://internal-runtime.example");
	const metadataUpdate = db.__updates.find((values) => values.elizaCloudAgentId === "cloud-waifu-test-waifu");
	const provisioning = (metadataUpdate?.metadata as { provisioning?: Record<string, unknown> } | undefined)
		?.provisioning;
	assert.equal(provisioning?.webUiUrl, "https://public-runtime.example");
	assert.equal(
		(provisioning?.account as { walletKeyRef?: string } | undefined)?.walletKeyRef,
		`steward:${provisionedAgentId}`,
	);
	assert.equal(launches.length, 1);
	resetProvisionDeps();
});

test("POST /v2/agents/provision keeps hosted agents provisioning until Eliza returns a hosted URL", async () => {
	const db = createProvisionDb();
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: "agk_hosted_pending_url_key", row: { agentId } as never }),
		elizaCloudClient: {
			async provisionWaifuAgent(input) {
				return {
					agentId: input.agentId,
					cloudAgentId: "cloud-waifu-pending-url",
					status: "running",
					account: {
						primaryWalletAddress: input.account?.primaryWalletAddress ?? null,
						walletKeyRef: input.account?.walletKeyRef ?? null,
						initialFreeCreditsUsd: 5,
					},
				};
			},
		},
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => ({
					agentId: input.agentId ?? "waifu-test-waifu",
					walletAddress: "0x0000000000000000000000000000000000000002",
					treasuryAddress: "0x0000000000000000000000000000000000000003",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					txHash: `0x${"1".repeat(64)}`,
					fourMeme: { nonce: "n", imageUrl: "https://example.com/i.png", createArgHash: "h" },
				}),
			}) as never,
	});

	const payload = provisionPayload();
	payload.runtime = { kind: "hosted" } as never;
	const res = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(payload),
	});

	assert.equal(res.status, 200, await res.clone().text());
	const overlay =
		db.__updates.find((values) => values.cloudAgentId === "cloud-waifu-pending-url") ??
		db.__inserts.find((values) => values.cloudAgentId === "cloud-waifu-pending-url");
	assert.equal(overlay?.agentStatus, "provisioning");
	assert.equal(overlay?.lifecycleState, "birth");
	assert.equal(overlay?.webUiUrl, null);
	const tokenUpdate = db.__updates.find((values) => values.agentId === "agent-row-1");
	assert.equal(tokenUpdate?.agentStatus, "provisioning");
	resetProvisionDeps();
});

test("POST /v2/agents/provision accepts wizard persona limits", async () => {
	const db = createProvisionDb();
	const launches: unknown[] = [];
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: "agk_wizard_limits_key", row: { agentId } as never }),
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					return {
						agentId: input.agentId ?? "waifu-long-name-agent",
						walletAddress: "0x0000000000000000000000000000000000000002",
						treasuryAddress: "0x0000000000000000000000000000000000000003",
						tokenAddress: "0x0000000000000000000000000000000000000004",
						txHash: `0x${"1".repeat(64)}`,
						fourMeme: { nonce: "n", imageUrl: "https://example.com/i.png", createArgHash: "h" },
					};
				},
			}) as never,
	});

	const payload = provisionPayload();
	payload.persona.name = "Long Wizard Persona Name With Digits 1234567";
	payload.persona.ticker = "W18BOT";

	const res = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(payload),
	});

	assert.equal(res.status, 200, await res.clone().text());
	assert.equal((launches[0] as { name?: string; symbol?: string }).name, payload.persona.name);
	assert.equal((launches[0] as { name?: string; symbol?: string }).symbol, "W18BOT");
	resetProvisionDeps();
});

test("POST /v2/agents/provision reserves last invite before launch", async () => {
	const db = createProvisionDb();
	const launches: unknown[] = [];
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: db.__inviteState.currentStewardUserId,
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: "agk_test_key", row: { agentId } as never }),
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					return {
						agentId: input.agentId ?? "waifu-test-waifu",
						walletAddress: "0x0000000000000000000000000000000000000002",
						treasuryAddress: "0x0000000000000000000000000000000000000003",
						tokenAddress: "0x0000000000000000000000000000000000000004",
						txHash: `0x${"1".repeat(64)}`,
						fourMeme: { nonce: "n", imageUrl: "https://example.com/i.png", createArgHash: "h" },
					};
				},
			}) as never,
	});

	const first = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(provisionPayload()),
	});
	assert.equal(first.status, 200);

	db.__inviteState.currentStewardUserId = "steward-user-2";
	const second = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify({
			...provisionPayload(),
			persona: { ...provisionPayload().persona, name: "Other Waifu", ticker: "OTHR" },
		}),
	});

	assert.equal(second.status, 400);
	assert.equal(((await second.json()) as { reason?: string }).reason, "validation");
	assert.equal(launches.length, 1);
	resetProvisionDeps();
});

test("POST /v2/agents/provision releases invite reservation when launch fails before persona write", async () => {
	const db = createProvisionDb();
	let shouldFail = true;
	const launches: unknown[] = [];
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: "agk_retry_key", row: { agentId } as never }),
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					if (shouldFail) throw new Error("persona write never happened");
					return {
						agentId: input.agentId ?? "waifu-test-waifu",
						walletAddress: "0x0000000000000000000000000000000000000002",
						treasuryAddress: "0x0000000000000000000000000000000000000003",
						tokenAddress: "0x0000000000000000000000000000000000000004",
						txHash: `0x${"1".repeat(64)}`,
						fourMeme: { nonce: "n", imageUrl: "https://example.com/i.png", createArgHash: "h" },
					};
				},
			}) as never,
	});

	const first = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(provisionPayload()),
	});
	assert.equal(first.status, 500);
	assert.equal(db.__inviteState.invite.usedCount, 0);
	assert.equal(db.__inviteState.redemptions.size, 0);

	shouldFail = false;
	const second = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(provisionPayload()),
	});

	assert.equal(second.status, 200);
	const json = (await second.json()) as { agentApiKey?: string; agentId?: string };
	assert.match(json.agentId ?? "", /^waifu-test-waifu-/);
	assert.equal(json.agentApiKey, "agk_retry_key");
	assert.equal(launches.length, 2);
	resetProvisionDeps();
});

test("POST /v2/agents/provision recovers duplicate retry with rotated agent api key", async () => {
	const db = createProvisionDb([
		{
			agentId: "waifu-test-waifu",
			taxRecipientAddress: "0x0000000000000000000000000000000000000003",
			tokenAddress: "0x0000000000000000000000000000000000000004",
		},
	]);
	const launches: unknown[] = [];
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: "agk_rotated_key", row: { agentId } as never }),
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					throw new Error("duplicate recovery should not launch");
				},
			}) as never,
	});

	const res = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(provisionPayload()),
	});

	assert.equal(res.status, 200);
	const json = (await res.json()) as {
		agentApiKey?: string;
		agentId?: string;
		safeAddress?: string;
		tokenAddress?: string;
	};
	assert.equal(json.agentId, "waifu-test-waifu");
	assert.equal(json.agentApiKey, "agk_rotated_key");
	assert.equal(json.safeAddress, "0x0000000000000000000000000000000000000003");
	assert.equal(json.tokenAddress, "0x0000000000000000000000000000000000000004");
	assert.equal(launches.length, 0);
	resetProvisionDeps();
});

test("POST /v2/agents/provision reuses existing hosted cloud metadata on duplicate retry", async () => {
	const db = createProvisionDb(
		[
			{
				agentId: "waifu-test-waifu",
				taxRecipientAddress: "0x0000000000000000000000000000000000000003",
				tokenAddress: "0x0000000000000000000000000000000000000004",
			},
		],
		{
			provisioning: {
				cloudAgentId: "cloud-existing-waifu",
				status: "running",
				jobId: "job-existing",
				containerUrl: "http://existing-internal.example",
				webUiUrl: "https://existing-public.example",
				account: {
					primaryWalletAddress: "0x0000000000000000000000000000000000000002",
					walletKeyRef: "steward:waifu-test-waifu",
					initialFreeCreditsUsd: 5,
				},
			},
		},
	);
	const cloudInputs: unknown[] = [];
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: "agk_rotated_key", row: { agentId } as never }),
		elizaCloudClient: {
			async provisionWaifuAgent(input) {
				cloudInputs.push(input);
				throw new Error("duplicate recovery should not create a second cloud agent");
			},
		},
		createOrchestrator: () =>
			({
				launch: async () => {
					throw new Error("duplicate recovery should not launch");
				},
			}) as never,
	});

	const payload = provisionPayload();
	payload.runtime = { kind: "hosted" } as never;
	const res = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(payload),
	});

	assert.equal(res.status, 200);
	const json = (await res.json()) as {
		cloudAgentId?: string;
		cloudStatus?: string;
		agentApiKey?: string;
		webUiUrl?: string | null;
		cloud?: { account?: { walletKeyRef?: string }; webUiUrl?: string | null };
	};
	assert.equal(json.cloudAgentId, "cloud-existing-waifu");
	assert.equal(json.cloudStatus, "running");
	assert.equal(json.agentApiKey, "agk_rotated_key");
	assert.equal(json.webUiUrl, "https://existing-public.example");
	assert.equal(json.cloud?.webUiUrl, "https://existing-public.example");
	assert.equal(json.cloud?.account?.walletKeyRef, "steward:waifu-test-waifu");
	const overlay =
		db.__updates.find((values) => values.cloudAgentId === "cloud-existing-waifu") ??
		db.__inserts.find((values) => values.cloudAgentId === "cloud-existing-waifu");
	assert.equal(overlay?.webUiUrl, "https://existing-public.example");
	assert.equal(overlay?.bridgeUrl, "http://existing-internal.example");
	assert.equal(cloudInputs.length, 0);
	resetProvisionDeps();
});

test("POST /v2/agents/provision recovers single-use invite retry after first success", async () => {
	const duplicateRows: Array<{ agentId: string; taxRecipientAddress: string | null; tokenAddress: string | null }> = [];
	const db = createProvisionDb(duplicateRows);
	const launches: unknown[] = [];
	let keyCount = 0;
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createAgentKey: async (_db, agentId) => ({ raw: `agk_retry_${++keyCount}`, row: { agentId } as never }),
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					return {
						agentId: input.agentId ?? "waifu-test-waifu",
						walletAddress: "0x0000000000000000000000000000000000000002",
						treasuryAddress: "0x0000000000000000000000000000000000000003",
						tokenAddress: "0x0000000000000000000000000000000000000004",
						txHash: `0x${"1".repeat(64)}`,
						fourMeme: { nonce: "n", imageUrl: "https://example.com/i.png", createArgHash: "h" },
					};
				},
			}) as never,
	});

	const first = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(provisionPayload()),
	});
	assert.equal(first.status, 200);
	assert.equal(db.__inviteState.invite.usedCount, 1);

	duplicateRows.push({
		agentId: "waifu-test-waifu",
		taxRecipientAddress: "0x0000000000000000000000000000000000000003",
		tokenAddress: "0x0000000000000000000000000000000000000004",
	});

	const retry = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify(provisionPayload()),
	});

	assert.equal(retry.status, 200);
	const json = (await retry.json()) as { agentApiKey?: string; agentId?: string };
	assert.equal(json.agentId, "waifu-test-waifu");
	assert.equal(json.agentApiKey, "agk_retry_2");
	assert.equal(launches.length, 1);
	resetProvisionDeps();
});

test("POST /v2/agents/launch injects missing agentId from the authed agent", async () => {
	const rawKey = "agk_0123456789abcdef0123456789abcdef";
	let selectCount = 0;
	const launches: Array<import("../../services/agent-launch/index.js").AgentLaunchInput> = [];
	const db = {
		select() {
			selectCount += 1;
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									if (selectCount === 1) {
										return Promise.resolve([
											{
												id: "key-1",
												agentId: "authed-agent-1",
												keyHash: hashKey(rawKey),
												scopes: ["launch:*"],
											},
										]);
									}
									if (selectCount === 2) {
										return Promise.resolve([{ agentId: "authed-agent-1", tokenAddress: null }]);
									}
									return Promise.resolve([{ agentId: "authed-agent-1", tokenAddress: null }]);
								},
							};
						},
					};
				},
			};
		},
		update() {
			return { set: () => ({ where: () => Promise.resolve() }) };
		},
	} as unknown as Database;
	__setAgentAuthDbForTest(db);
	__setAgentsRouteDepsForTest({
		db,
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					return {
						agentId: input.agentId ?? "fresh-agent-id",
						walletAddress: "0x0000000000000000000000000000000000000002",
						treasuryAddress: "0x0000000000000000000000000000000000000003",
						tokenAddress: "0x0000000000000000000000000000000000000004",
						txHash: `0x${"1".repeat(64)}`,
						fourMeme: { nonce: "n", imageUrl: "https://example.com/i.png", createArgHash: "h" },
					};
				},
			}) as never,
	});

	const res = await app.request("/launch", {
		method: "POST",
		headers: { authorization: `Bearer ${rawKey}` },
		body: JSON.stringify({
			name: "Authed Waifu",
			symbol: "AUTH",
			description: "launch with implicit agent id",
			imageUrl: "https://example.com/i.png",
		}),
	});

	assert.equal(res.status, 200);
	assert.equal(launches.length, 1);
	assert.equal(launches[0]?.agentId, "authed-agent-1");
	const json = (await res.json()) as { agentId?: string };
	assert.equal(json.agentId, "authed-agent-1");
	resetProvisionDeps();
});

test("POST /v2/agents/provision rejects unsupported launchpad with explicit code", async () => {
	const db = createProvisionDb();
	const launches: unknown[] = [];
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		tenantId: "waifu",
		email: "patron@example.com",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "evm" }],
	}));
	__setAgentsRouteDepsForTest({
		db,
		createOrchestrator: () =>
			({
				launch: async (input: import("../../services/agent-launch/index.js").AgentLaunchInput) => {
					launches.push(input);
					throw new Error("unsupported launchpad should not launch");
				},
			}) as never,
	});

	const res = await app.request("/provision", {
		method: "POST",
		headers: { authorization: "Bearer steward" },
		body: JSON.stringify({
			...provisionPayload(),
			launchpad: {
				launchpad_id: "pump-fun",
				chain: "solana",
				launchpad_config: { kind: "pump-fun" },
				fee_mode: "regular",
			},
		}),
	});

	assert.equal(res.status, 400);
	const json = (await res.json()) as { code?: string; reason?: string };
	assert.equal(json.reason, "validation");
	assert.equal(json.code, "LAUNCHPAD_NOT_SUPPORTED");
	assert.equal(launches.length, 0);
	resetProvisionDeps();
});
