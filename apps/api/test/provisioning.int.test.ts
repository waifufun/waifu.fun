import assert from "node:assert/strict";
import test from "node:test";

import { provisionClaimedAgent } from "../src/services/provisioning.js";

const persona = {
	id: "11111111-1111-1111-1111-111111111111",
	agentId: "waifu-demo-01",
	name: "Demo Waifu",
	claimedByXHandle: "eliza",
	twitterHandle: null,
	bio: null,
	avatarUrl: null,
	systemPrompt: null,
	ownerAddress: null,
	runtimeKind: "eliza-cloud",
	runtimeWebhookUrl: null,
	tokenAddress: null,
	chain: "bsc",
	prelaunchParams: null,
	taxConfig: { feeRate: 3 },
	metadata: {},
};

test("provisionClaimedAgent provisions eliza agent and emits provisioning events", async () => {
	const events: { agentId: string | null; eventType: string; data: Record<string, unknown> }[] = [];
	const createCalls: { userId: string; data: Record<string, unknown> }[] = [];

	await provisionClaimedAgent(
		"waifu-demo-01",
		{ claimedByXHandle: "eliza" },
		{
			db: fakeProvisioningDb() as never,
			elizaClient: {
				async createAgent(userId: string, data: Record<string, unknown>) {
					createCalls.push({ userId, data });
					return {
						agentId: "eliza-container-1",
						agentName: "Demo Waifu",
						jobId: "job-1",
						status: "queued",
						nodeId: "node-1",
						message: "created",
					};
				},
			} as never,
			emitEvent: async (event) => {
				events.push({
					agentId: event.agentId ?? null,
					eventType: event.eventType,
					data: event.data ?? {},
				});
				return {} as never;
			},
		},
	);

	assert.equal(createCalls.length, 1);
	assert.equal(createCalls[0]?.userId, "waifu-demo-01");
	assert.deepEqual(createCalls[0]?.data, {
		agentName: "Demo Waifu",
		agentConfig: {
			persona: { name: "Demo Waifu", bio: "" },
			safeAddress: "0x1111111111111111111111111111111111111111",
			xHandle: "eliza",
		},
	});
	assert.deepEqual(
		events.map((event) => event.eventType),
		["agent.provisioning_started", "agent.provisioned"],
	);
	assert.equal(events[1]?.data.runtimeAgentId, "eliza-container-1");
	assert.equal(events[1]?.data.containerId, undefined);
});

test("provisionClaimedAgent returns partial Eliza Cloud metadata without creating a duplicate", async () => {
	const partialPersona = {
		...persona,
		metadata: {
			provisioning: {
				runtimeKind: "eliza-cloud",
				runtimeAgentId: "cloud-partial-claim",
				cloudAgentId: "cloud-partial-claim",
				status: "pending",
			},
		},
	};
	const events: { eventType: string; data: Record<string, unknown> }[] = [];
	let createCalls = 0;

	const result = await provisionClaimedAgent(
		"waifu-demo-01",
		{ claimedByXHandle: "eliza" },
		{
			db: fakeProvisioningDb(partialPersona) as never,
			elizaClient: {
				async createAgent() {
					createCalls += 1;
					return {
						agentId: "cloud-partial-claim-2",
						agentName: "Demo Waifu",
						jobId: "job-retry",
						status: "queued",
						nodeId: "node-1",
						message: "created",
					};
				},
			} as never,
			emitEvent: async (event) => {
				events.push({ eventType: event.eventType, data: event.data ?? {} });
				return {} as never;
			},
		},
	);

	assert.equal(createCalls, 0);
	assert.equal(result.runtimeAgentId, "cloud-partial-claim");
	assert.equal(result.containerId, undefined);
	assert.deepEqual(events, []);
});

test("provisionClaimedAgent marks token overlay live only when a hosted URL and running status exist", async () => {
	const liveDb = fakeProvisioningDb({
		...persona,
		tokenAddress: "0x0000000000000000000000000000000000000004",
	});
	await provisionClaimedAgent(
		"waifu-demo-01",
		{ agentWalletAddress: "0x0000000000000000000000000000000000000009" },
		{
			db: liveDb as never,
			elizaClient: {
				async createAgent() {
					throw new Error("service provisioning should be used when token metadata exists");
				},
				async provisionWaifuAgent() {
					return {
						cloudAgentId: "cloud-live-claim",
						status: "running",
						webUiUrl: "https://hosted-live.example",
					};
				},
			} as never,
			emitEvent: async () => ({}) as never,
		},
	);

	const liveOverlay = liveDb.__agentWrites.find((values) => values.cloudAgentId === "cloud-live-claim");
	assert.equal(liveOverlay?.agentStatus, "running");
	assert.equal(liveOverlay?.lifecycleState, "live");
	assert.equal(liveOverlay?.webUiUrl, "https://hosted-live.example");
	assert.equal(liveDb.__tokenWrites.at(-1)?.agentStatus, "running");

	const pendingDb = fakeProvisioningDb({
		...persona,
		tokenAddress: "0x0000000000000000000000000000000000000004",
	});
	await provisionClaimedAgent(
		"waifu-demo-01",
		{ agentWalletAddress: "0x0000000000000000000000000000000000000009" },
		{
			db: pendingDb as never,
			elizaClient: {
				async createAgent() {
					throw new Error("service provisioning should be used when token metadata exists");
				},
				async provisionWaifuAgent() {
					return {
						cloudAgentId: "cloud-pending-url-claim",
						status: "running",
					};
				},
			} as never,
			emitEvent: async () => ({}) as never,
		},
	);

	const pendingOverlay = pendingDb.__agentWrites.find((values) => values.cloudAgentId === "cloud-pending-url-claim");
	assert.equal(pendingOverlay?.agentStatus, "provisioning");
	assert.equal(pendingOverlay?.lifecycleState, "birth");
	assert.equal(pendingOverlay?.webUiUrl, null);
	assert.equal(pendingDb.__tokenWrites.at(-1)?.agentStatus, "provisioning");
});

function fakeProvisioningDb(personaRow: typeof persona = persona) {
	const agentWrites: Record<string, unknown>[] = [];
	const tokenWrites: Record<string, unknown>[] = [];
	const personaWrites: Record<string, unknown>[] = [];
	return {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								orderBy() {
									return {
										limit() {
											return Promise.resolve([]);
										},
									};
								},
								limit() {
									if (fields && "safeAddress" in fields) {
										return Promise.resolve([{ safeAddress: "0x1111111111111111111111111111111111111111" }]);
									}
									if (fields && "walletAddress" in fields) {
										return Promise.resolve([]);
									}
									if (fields && "token" in fields) {
										return Promise.resolve([{ token: { id: "token-row-1", agentId: null }, agent: null }]);
									}
									return Promise.resolve([personaRow]);
								},
							};
						},
					};
				},
				};
			},
			insert() {
				return {
					values(values: Record<string, unknown>) {
						agentWrites.push(values);
						return {
							returning() {
								return Promise.resolve([{ id: "agent-row-1" }]);
							},
						};
					},
				};
			},
			update() {
				return {
					set(values: Record<string, unknown>) {
						return {
							where() {
								if ("cloudAgentId" in values) agentWrites.push(values);
								else if ("agentStatus" in values || "agentId" in values) tokenWrites.push(values);
								else personaWrites.push(values);
								return {
									returning() {
										return Promise.resolve([personaRow]);
								},
							};
						},
					};
					},
				};
			},
			__agentWrites: agentWrites,
			__tokenWrites: tokenWrites,
			__personaWrites: personaWrites,
		};
	}
