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
					webUiUrl: "https://cloud-agent-1.waifu.fun",
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
		account: {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			walletKeyRef: "steward:waifu-demo-01",
		},
		access: {
			guestMinTokens: 1_000,
			userMinTokens: 100_000,
			thresholdMode: "strict_gt",
			adminWallets: ["0x0000000000000000000000000000000000000001"],
		},
		webhookUrl: "https://waifu.fun/webhooks/eliza",
		webhookSecret: "secret_123",
		modelDefaults: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
		container: {
			imageUri: "ecr.test/waifu-agent:latest",
			projectName: "waifu-demo-01",
			port: 3000,
			environmentVars: {
				WAIFU_AGENT_EVM_ADDRESS: "0x0000000000000000000000000000000000000009",
			},
		},
		billing: {
			mode: "owner_credits",
			initialReserveUsd: 5,
		},
	});

	assert.equal(result.runtimeAgentId, "cloud-agent-1");
	assert.equal(result.containerId, undefined);
	assert.equal(result.webUiUrl, "https://cloud-agent-1.waifu.fun");
	assert.equal(result.livenessCheckUrl, "https://cloud-agent-1.waifu.fun");
	assert.equal(result.status, "pending");
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
		account: {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			walletKeyRef: "steward:waifu-demo-01",
		},
		access: {
			guestMinTokens: 1_000,
			userMinTokens: 100_000,
			thresholdMode: "strict_gt",
			adminWallets: ["0x0000000000000000000000000000000000000001"],
		},
		billing: {
			mode: "owner_credits",
			initialReserveUsd: 5,
		},
		container: {
			imageUri: "ecr.test/waifu-agent:latest",
			projectName: "waifu-demo-01",
			port: 3000,
			environmentVars: {
				WAIFU_AGENT_EVM_ADDRESS: "0x0000000000000000000000000000000000000009",
			},
		},
		webhookUrl: "https://waifu.fun/webhooks/eliza",
		webhookSecret: "secret_123",
		modelDefaults: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
	});
});

test("provision keeps raw container URL separate from hosted liveness URL", async () => {
	const adapter = new ElizaCloudRuntimeAdapter({
		client: {
			async createAgent() {
				throw new Error("legacy createAgent should not be called");
			},
			async provisionWaifuAgent() {
				return {
					cloudAgentId: "cloud-agent-container-only",
					status: "running",
					containerUrl: "http://agent-bridge.internal",
				};
			},
			async pauseAgent() {},
			async resumeAgent() {},
			async deprovisionAgent() {},
		},
	});

	const result = await adapter.provision({
		agentId: "waifu-container-only",
		agentName: "Container Only",
		persona: { name: "Container Only", bio: "container-only fixture" },
		safeAddress: null,
		xHandle: null,
		tokenAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		chainId: 56,
		tokenName: "Demo Token",
		tokenTicker: "DEMO",
		account: {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		},
	});

	assert.equal(result.runtimeAgentId, "cloud-agent-container-only");
	assert.equal(result.containerUrl, "http://agent-bridge.internal");
	assert.equal(result.webUiUrl, undefined);
	assert.equal(result.livenessCheckUrl, undefined);
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
	assert.equal(result.status, "queued");
	assert.equal(createCalls.length, 1);
});
