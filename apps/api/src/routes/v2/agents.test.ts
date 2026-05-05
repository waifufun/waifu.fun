import assert from "node:assert/strict";
import test from "node:test";

import { redeemProvisionInviteCode, resurrectAgent } from "./agents.js";

test("resurrectAgent tops up credits, clears dormant fields, and emits resurrection", async () => {
	const updates: unknown[] = [];
	const wheres: unknown[] = [];
	const toppedUp: unknown[] = [];
	const emitted: unknown[] = [];
	const db = {
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
		miladyClient: {
			async topUpCredits(agentId, amount) {
				toppedUp.push({ agentId, amount });
			},
		},
		async emitEvent(input) {
			emitted.push(input);
			return {} as Awaited<ReturnType<NonNullable<Parameters<typeof resurrectAgent>[2]["emitEvent"]>>>;
		},
	});

	assert.deepEqual(result, { agentId: "waifu-demo-01", creditsAmount: 2500, modelTier: "premium" });
	assert.deepEqual(toppedUp, [{ agentId: "waifu-demo-01", amount: 2500 }]);
	assert.equal(updates.length, 1);
	const values = (updates[0] as { values: Record<string, unknown> }).values;
	assert.equal(values.dormantAt, null);
	assert.equal(values.brainPausedAt, null);
	assert.equal(values.lastWordsPostedAt, null);
	assert.equal(values.modelTier, "premium");
	assert.equal(wheres.length, 1);
	assert.equal((emitted[0] as { eventType: string }).eventType, "agent.resurrected");
});

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../../middleware/patron-auth.js";
import app, { __setAgentsRouteDepsForTest } from "./agents.js";

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
			};
			return fn(tx);
		},
	};
	return { db: db as never, state };
}

function createProvisionDb() {
	let selectCount = 0;
	const inviteDb = createInviteRedemptionDb();
	return {
		select() {
			selectCount += 1;
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve(selectCount === 1 ? [PATRON_ROW] : []);
								},
								orderBy() {
									return { limit: () => Promise.resolve([]) };
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
		transaction: (inviteDb.db as { transaction: unknown }).transaction,
	} as never;
}

function resetProvisionDeps() {
	__setAgentsRouteDepsForTest({});
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
}

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
		validateInviteCode: async () => ({ valid: true }),
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

	assert.equal(res.status, 200);
	const json = (await res.json()) as { agentApiKey?: string; safeAddress?: string };
	assert.equal(json.agentApiKey, "agk_test_key");
	assert.equal(json.safeAddress, "0x0000000000000000000000000000000000000003");
	assert.equal(launches.length, 1);
	assert.equal((launches[0] as { name: string }).name, "Test Waifu");
	resetProvisionDeps();
});
