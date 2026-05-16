import assert from "node:assert/strict";
import test from "node:test";

import { ElizaCloudRuntimeAdapter, type ElizaProvisionWaifuAgentInput } from "./eliza-cloud.js";

test("provision uses Eliza Cloud service contract when token metadata is available", async () => {
	const calls: ElizaProvisionWaifuAgentInput[] = [];
	const adapter = new ElizaCloudRuntimeAdapter({
		client: {
			async createAgent() {
				throw new Error("legacy createAgent should not be called");
			},
			async provisionWaifuAgent(input) {
				calls.push(input);
				return {
					cloudAgentId: "cloud-agent-1",
					characterId: "character-1",
					jobId: "job-1",
					status: "pending",
				};
			},
			async pauseAgent() {},
			async resumeAgent() {},
			async deprovisionAgent() {},
		},
	});

	const result = await adapter.provision({
		agentId: "waifu-demo-01",
		agentName: "Demo Waifu",
		persona: { name: "Demo Waifu", bio: "hello", image: "https://example.test/avatar.png" },
		safeAddress: "0x0000000000000000000000000000000000000001",
		xHandle: "demo",
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		chainId: 56,
		tokenName: "Demo Token",
		tokenTicker: "DEMO",
		launchType: "native",
		webhookUrl: "https://waifu.fun/webhooks/eliza",
		modelDefaults: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
	});

	assert.equal(result.runtimeAgentId, "cloud-agent-1");
	assert.equal(result.containerId, "cloud-agent-1");
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0], {
		agentId: "waifu-demo-01",
		tokenContractAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		chainId: 56,
		tokenName: "Demo Token",
		tokenTicker: "DEMO",
		launchType: "native",
		character: {
			name: "Demo Waifu",
			bio: "hello",
			avatar: "https://example.test/avatar.png",
			config: {
				persona: { name: "Demo Waifu", bio: "hello", image: "https://example.test/avatar.png" },
				safeAddress: "0x0000000000000000000000000000000000000001",
				xHandle: "demo",
			},
		},
		webhookUrl: "https://waifu.fun/webhooks/eliza",
		modelDefaults: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
	});
});

test("provision falls back to legacy createAgent when token metadata is unavailable", async () => {
	const createCalls: unknown[] = [];
	const adapter = new ElizaCloudRuntimeAdapter({
		client: {
			async createAgent(userId, data) {
				createCalls.push({ userId, data });
				return { agentId: "legacy-agent-1", status: "queued" };
			},
			async provisionWaifuAgent() {
				throw new Error("service provision should not be called");
			},
			async pauseAgent() {},
			async resumeAgent() {},
			async deprovisionAgent() {},
		},
	});

	const result = await adapter.provision({
		agentId: "waifu-demo-01",
		agentName: "Demo Waifu",
		persona: { name: "Demo Waifu", bio: "" },
		safeAddress: null,
		xHandle: null,
	});

	assert.equal(result.runtimeAgentId, "legacy-agent-1");
	assert.equal(createCalls.length, 1);
});
