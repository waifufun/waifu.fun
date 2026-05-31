import assert from "node:assert/strict";
import test from "node:test";

import { provisionClaimedAgent } from "../src/services/provisioning.js";

const persona = {
	id: "11111111-1111-1111-1111-111111111111",
	agentId: "waifu-demo-01",
	name: "Demo Waifu",
	claimedByXHandle: "eliza",
	twitterHandle: null,
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

function fakeProvisioningDb(personaRow: typeof persona = persona) {
	return {
		select(fields?: Record<string, unknown>) {
			return {
				from() {
					return {
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
									return Promise.resolve([personaRow]);
								},
							};
						},
					};
				},
			};
		},
		update() {
			return {
				set() {
					return {
						where() {
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
	};
}
