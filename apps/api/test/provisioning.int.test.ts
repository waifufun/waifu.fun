import assert from "node:assert/strict";
import test from "node:test";

import { dispatchEvent } from "../src/services/webhook-consumer/index.js";

const persona = {
	id: "11111111-1111-1111-1111-111111111111",
	agentId: "waifu-demo-01",
	name: "Demo Waifu",
	claimedByXHandle: "eliza",
	twitterHandle: null,
	taxConfig: { feeRate: 3 },
	metadata: {},
};

test("agent.claimed records the claim without provisioning before launch", async () => {
	const events: { agentId: string | null; eventType: string; data: Record<string, unknown> }[] = [];
	const createCalls: { userId: string; data: Record<string, unknown> }[] = [];

	await dispatchEvent(
		{
			event: "agent.claimed",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { claimedByXHandle: "eliza" },
			idempotencyKey: "evt_provision_1",
		},
		{
			db: fakeProvisioningDb() as never,
			logger: console,
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
			async emitEvent(event) {
				events.push({
					agentId: event.agentId ?? null,
					eventType: event.eventType,
					data: event.data ?? {},
				});
				return {} as never;
			},
		},
	);

	assert.equal(createCalls.length, 0);
	assert.deepEqual(events, []);
});

function fakeProvisioningDb() {
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
									return Promise.resolve([persona]);
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
									return Promise.resolve([persona]);
								},
							};
						},
					};
				},
			};
		},
	};
}
