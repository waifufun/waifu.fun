import assert from "node:assert/strict";
import test from "node:test";

import { agentEvents, agentPersonas } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { buildProvisionOptions, getAgentRuntimeState } from "./provisioning.js";

test("buildProvisionOptions uses agent wallet for account and creator/safe wallet for admin fallback", () => {
	const options = buildProvisionOptions(
		"waifu-demo-01",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: { symbol: "DEMO" },
		},
		{
			agentWalletAddress: "0x0000000000000000000000000000000000000009",
			containerImageUri: "ecr.test/waifu-agent:latest",
			containerProjectName: "waifu-demo-01",
			containerPort: 3000,
			containerEnvironmentVars: {
				WAIFU_AGENT_EVM_ADDRESS: "0x0000000000000000000000000000000000000009",
				IGNORED_NUMERIC_VALUE: 1,
			},
		},
		"0x0000000000000000000000000000000000000002",
	);

	assert.deepEqual(options.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:waifu-demo-01",
	});
	assert.deepEqual(options.access?.adminWallets, ["0x0000000000000000000000000000000000000001"]);
	assert.equal(options.access?.guestMinTokens, 1_000);
	assert.equal(options.access?.userMinTokens, 100_000);
	assert.equal(options.access?.thresholdMode, "strict_gt");
	assert.deepEqual(options.billing, {
		mode: "owner_credits",
		initialReserveUsd: 5,
	});
	assert.deepEqual(options.container, {
		imageUri: "ecr.test/waifu-agent:latest",
		projectName: "waifu-demo-01",
		port: 3000,
		environmentVars: {
			WAIFU_AGENT_EVM_ADDRESS: "0x0000000000000000000000000000000000000009",
		},
	});
});

test("buildProvisionOptions forwards explicit agent wallet key references", () => {
	const options = buildProvisionOptions(
		"waifu-demo-key-ref",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: null,
		},
		{
			agentWalletAddress: "0x0000000000000000000000000000000000000009",
			walletKeyRef: "steward:custom-claim-key",
		},
		null,
	);

	assert.deepEqual(options.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:custom-claim-key",
	});
});

test("buildProvisionOptions prefers explicit agent wallet fields over generic walletAddress", () => {
	const options = buildProvisionOptions(
		"waifu-demo-wallet-precedence",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: null,
		},
		{
			walletAddress: "0x0000000000000000000000000000000000000001",
			agentWalletAddress: "0x0000000000000000000000000000000000000009",
		},
		null,
	);

	assert.deepEqual(options.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:waifu-demo-wallet-precedence",
	});
	assert.deepEqual(options.access?.adminWallets, ["0x0000000000000000000000000000000000000001"]);
});

test("buildProvisionOptions falls back to stored Steward agent wallet for the Eliza Cloud account", () => {
	const options = buildProvisionOptions(
		"waifu-demo-stored-wallet",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: null,
		},
		{},
		null,
		"0x0000000000000000000000000000000000000009",
	);

	assert.deepEqual(options.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:waifu-demo-stored-wallet",
	});
	assert.deepEqual(options.access?.adminWallets, ["0x0000000000000000000000000000000000000001"]);
});

test("buildProvisionOptions does not treat creator wallet as the agent Eliza Cloud account", () => {
	const options = buildProvisionOptions(
		"waifu-demo-02",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: null,
		},
		{},
		"0x0000000000000000000000000000000000000002",
	);

	assert.equal(options.account, undefined);
	assert.deepEqual(options.access?.adminWallets, ["0x0000000000000000000000000000000000000001"]);
});

test("buildProvisionOptions rejects invalid agent wallet values before Eliza Cloud provisioning", () => {
	assert.throws(
		() =>
			buildProvisionOptions(
				"waifu-demo-03",
				{
					name: "Demo",
					bio: null,
					avatarUrl: null,
					systemPrompt: null,
					claimedByXHandle: null,
					ownerAddress: "0x0000000000000000000000000000000000000001",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					prelaunchParams: null,
				},
				{ primaryWalletAddress: "not-an-address" },
				null,
			),
		/agent EVM wallet.*valid EVM address/,
	);
});

test("buildProvisionOptions rejects invalid admin wallet values before Eliza Cloud provisioning", () => {
	assert.throws(
		() =>
			buildProvisionOptions(
				"waifu-demo-04",
				{
					name: "Demo",
					bio: null,
					avatarUrl: null,
					systemPrompt: null,
					claimedByXHandle: null,
					ownerAddress: "not-an-address",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					prelaunchParams: null,
				},
				{ primaryWalletAddress: "0x0000000000000000000000000000000000000009" },
				null,
			),
		/admin wallet.*valid EVM address/,
	);
});

test("getAgentRuntimeState keeps async Eliza Cloud jobs provisioning until hosted evidence exists", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-async-01",
			agentLaunchStatus: "claimed",
			metadata: {
				provisioning: {
					runtimeAgentId: "cloud-agent-async",
					cloudAgentId: "cloud-agent-async",
					status: "pending",
				},
			},
		},
		events: [],
	});

	const state = await getAgentRuntimeState(db, "waifu-async-01");

	assert.equal(state?.state, "provisioning");
	assert.equal(state?.cloudAgentId, "cloud-agent-async");
	assert.equal(state?.runtimeAgentId, "cloud-agent-async");
	assert.equal(state?.containerId, undefined);
	assert.equal(state?.webUiUrl, undefined);
});

test("getAgentRuntimeState keeps running containers provisioning until a hosted chat URL exists", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-container-only-01",
			agentLaunchStatus: "claimed",
			metadata: {
				provisioning: {
					runtimeAgentId: "cloud-agent-container-only",
					cloudAgentId: "cloud-agent-container-only",
					containerId: "container-only-1",
					containerUrl: "http://container-only.internal",
					status: "running",
				},
			},
		},
		events: [],
	});

	const state = await getAgentRuntimeState(db, "waifu-container-only-01");

	assert.equal(state?.state, "provisioning");
	assert.equal(state?.cloudAgentId, "cloud-agent-container-only");
	assert.equal(state?.containerId, "container-only-1");
	assert.equal(state?.containerUrl, "http://container-only.internal");
	assert.equal(state?.webUiUrl, undefined);
});

test("getAgentRuntimeState reports live only when Eliza Cloud exposes hosted runtime evidence", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-live-01",
			agentLaunchStatus: "claimed",
			metadata: {
				provisioning: {
					runtimeAgentId: "cloud-agent-live",
					cloudAgentId: "cloud-agent-live",
					status: "running",
					webUiUrl: "https://hosted-agent.example",
				},
			},
		},
		events: [],
	});

	const state = await getAgentRuntimeState(db, "waifu-live-01");

	assert.equal(state?.state, "live");
	assert.equal(state?.cloudAgentId, "cloud-agent-live");
	assert.equal(state?.webUiUrl, "https://hosted-agent.example");
});

test("getAgentRuntimeState returns null when no persona exists for the agent", async () => {
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								orderBy() {
									return { limit: () => Promise.resolve([]) };
								},
								limit: () => Promise.resolve([]),
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	const state = await getAgentRuntimeState(db, "waifu-missing-01");
	assert.equal(state, null);
});

test("getAgentRuntimeState reports pending before any provisioning claim or runtime metadata", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-pending-01",
			agentLaunchStatus: "prelaunch",
			metadata: {},
		},
		events: [],
	});

	const state = await getAgentRuntimeState(db, "waifu-pending-01");

	assert.equal(state?.state, "pending");
	assert.equal(state?.cloudAgentId, undefined);
	assert.equal(state?.runtimeAgentId, undefined);
	assert.equal(state?.lastError, undefined);
});

test("getAgentRuntimeState reports provisioning once the agent is claimed but lacks runtime metadata", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-claimed-01",
			agentLaunchStatus: "claimed",
			metadata: {},
		},
		events: [],
	});

	const state = await getAgentRuntimeState(db, "waifu-claimed-01");

	assert.equal(state?.state, "provisioning");
	assert.equal(state?.runtimeAgentId, undefined);
});

test("getAgentRuntimeState reports failed when the latest provisioning event is a failure", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-failed-01",
			agentLaunchStatus: "claimed",
			metadata: {
				provisioning: {
					runtimeAgentId: "cloud-agent-failed",
					cloudAgentId: "cloud-agent-failed",
					status: "pending",
				},
			},
		},
		events: [
			{
				eventType: "agent.provisioning_failed",
				data: { error: "eliza-cloud POST /api/v1/agents: 500 boom" },
				createdAt: new Date("2026-05-31T05:00:00Z"),
			},
		],
	});

	const state = await getAgentRuntimeState(db, "waifu-failed-01");

	assert.equal(state?.state, "failed");
	assert.equal(state?.lastError, "eliza-cloud POST /api/v1/agents: 500 boom");
	assert.equal(state?.lastEventAt, "2026-05-31T05:00:00.000Z");
});

test("getAgentRuntimeState reports failed when the latest provisioning event is a dead-letter", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-deadletter-01",
			agentLaunchStatus: "claimed",
			metadata: { provisioning: { cloudAgentId: "cloud-agent-dead", status: "pending" } },
		},
		events: [
			{
				eventType: "agent.provisioning_dead_letter",
				data: { error: "hosted chat URL never became ready", attempts: 3 },
				createdAt: new Date("2026-05-31T05:10:00Z"),
			},
		],
	});

	const state = await getAgentRuntimeState(db, "waifu-deadletter-01");

	assert.equal(state?.state, "failed");
	assert.equal(state?.lastError, "hosted chat URL never became ready");
});

test("getAgentRuntimeState reports failed when provisioning metadata records a last error even without a failure event", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-metaerror-01",
			agentLaunchStatus: "claimed",
			metadata: {
				provisioning: {
					cloudAgentId: "cloud-agent-meta",
					status: "failed",
					lastError: "steward wallet provisioning rejected",
				},
			},
		},
		events: [],
	});

	const state = await getAgentRuntimeState(db, "waifu-metaerror-01");

	assert.equal(state?.state, "failed");
	assert.equal(state?.lastError, "steward wallet provisioning rejected");
});

test("getAgentRuntimeState reports dormant when the agent is killed, even with live runtime evidence", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-killed-01",
			agentLaunchStatus: "claimed",
			killedAt: new Date("2026-05-31T04:00:00Z"),
			metadata: {
				provisioning: {
					cloudAgentId: "cloud-agent-killed",
					runtimeAgentId: "cloud-agent-killed",
					containerUrl: "https://hosted-killed.example",
					webUiUrl: "https://hosted-killed.example",
					status: "running",
				},
			},
		},
		events: [],
	});

	const state = await getAgentRuntimeState(db, "waifu-killed-01");

	// Dormant must win over live: a killed agent is never reported as live even with a hosted URL.
	assert.equal(state?.state, "dormant");
	assert.equal(state?.webUiUrl, "https://hosted-killed.example");
});

test("getAgentRuntimeState reports dormant when the agent brain is paused", async () => {
	const db = fakeRuntimeStateDb({
		persona: {
			id: "persona-1",
			agentId: "waifu-paused-01",
			agentLaunchStatus: "claimed",
			brainPausedAt: new Date("2026-05-31T04:30:00Z"),
			metadata: {
				provisioning: {
					cloudAgentId: "cloud-agent-paused",
					runtimeAgentId: "cloud-agent-paused",
					status: "running",
					webUiUrl: "https://hosted-paused.example",
				},
			},
		},
		events: [],
	});

	const state = await getAgentRuntimeState(db, "waifu-paused-01");

	assert.equal(state?.state, "dormant");
});

function fakeRuntimeStateDb({
	persona,
	events,
}: {
	persona: Record<string, unknown>;
	events: Array<{ eventType: string; data: Record<string, unknown>; createdAt: Date }>;
}) {
	return {
		select() {
			return {
				from(table: unknown) {
					return {
						where() {
							return {
								orderBy() {
									return {
										limit() {
											return Promise.resolve(events);
										},
									};
								},
								limit() {
									if (table === agentEvents) return Promise.resolve(events);
									if (table === agentPersonas) return Promise.resolve([persona]);
									return Promise.resolve([]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;
}
