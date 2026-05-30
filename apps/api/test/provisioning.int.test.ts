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
	const provisionCalls: Record<string, unknown>[] = [];

	await provisionClaimedAgent("waifu-demo-01", { claimedByXHandle: "eliza" }, {
		db: fakeProvisioningDb() as never,
		runtimeRegistry: new Map([
			[
				"eliza-cloud",
				{
					kind: "eliza-cloud",
					async provision(options: Record<string, unknown>) {
						provisionCalls.push(options);
						return {
							runtimeAgentId: "eliza-container-1",
							containerId: "eliza-container-1",
							livenessCheckUrl: "https://eliza.example/agents/eliza-container-1",
						};
					},
				} as never,
			],
		]),
		async emitEvent(event) {
			events.push({
				agentId: event.agentId ?? null,
				eventType: event.eventType,
				data: event.data ?? {},
			});
			return {} as never;
		},
	});

	assert.equal(provisionCalls.length, 1);
	assert.deepEqual(provisionCalls[0], {
		agentId: "waifu-demo-01",
		agentName: "Demo Waifu",
		persona: {
			name: "Demo Waifu",
			bio: "",
		},
		safeAddress: "0x1111111111111111111111111111111111111111",
		tokenAddress: null,
		chain: "bsc",
		chainId: 56,
		tokenName: "Demo Waifu",
		tokenTicker: "WAIFU-DEMO",
		launchType: "native",
		xHandle: "eliza",
		access: {
			guestMinTokens: 1000,
			userMinTokens: 100000,
			thresholdMode: "strict_gt",
			adminWallets: ["0x1111111111111111111111111111111111111111"],
		},
	});
	assert.deepEqual(
		events.map((event) => event.eventType),
		["agent.provisioning_started", "agent.provisioned"],
	);
	assert.equal(events[1]?.data.containerId, "eliza-container-1");
});

function readDrizzleTableName(t: unknown): string | null {
	if (!t || typeof t !== "object") return null;
	const sym = Object.getOwnPropertySymbols(t).find((s) => s.description === "drizzle:Name");
	if (!sym) return null;
	const value = (t as Record<symbol, unknown>)[sym];
	return typeof value === "string" ? value : null;
}

function fakeProvisioningDb() {
	return {
		select(fields?: Record<string, unknown>) {
			let table: string | null = null;
			return {
				from(t: unknown) {
					table = readDrizzleTableName(t);
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
									if (table === "agent_personas") {
										return Promise.resolve([persona]);
									}
									if (fields && "safeAddress" in fields) {
										return Promise.resolve([{ safeAddress: "0x1111111111111111111111111111111111111111" }]);
									}
									if (table === "launches") {
										return Promise.resolve([]);
									}
									return Promise.resolve([]);
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
		insert() {
			return {
				values() {
					return {
						onConflictDoUpdate() {
							return {
								returning() {
									return Promise.resolve([{ id: "creator-1" }]);
								},
							};
						},
						returning() {
							return Promise.resolve([{ id: "creator-1" }]);
						},
					};
				},
			};
		},
	};
}
