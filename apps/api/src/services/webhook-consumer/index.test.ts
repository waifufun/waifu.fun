import assert from "node:assert/strict";
import test from "node:test";

import type { ElizaCloudClient } from "../eliza-client.js";
import { type WebhookConsumerPersonaStore, dispatchEvent } from "./index.js";

function elizaStub(calls: { paused?: string[]; resumed?: string[] } = {}): ElizaCloudClient {
	return {
		async provisionAgent() {
			return { containerId: "container-1" };
		},
		async pauseAgent(agentId) {
			calls.paused?.push(agentId);
		},
		async resumeAgent(agentId) {
			calls.resumed?.push(agentId);
		},
		async deprovisionAgent() {},
		async topUpCredits() {
			return undefined;
		},
	};
}

test("agent.claimed records only and waits for agent.launched to provision", async () => {
	let provisionCalls = 0;
	const emitted: unknown[] = [];

	await dispatchEvent(
		{
			event: "agent.claimed",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { claimedByXHandle: "eliza" },
			idempotencyKey: "evt_claimed_1",
		},
		{
			elizaCloud: {
				...elizaStub(),
				async provisionAgent() {
					provisionCalls += 1;
					throw new Error("agent.claimed should not provision");
				},
			},
			logger: {},
			async emitEvent(input) {
				emitted.push(input);
				return {} as Awaited<ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>>;
			},
		},
	);

	assert.equal(provisionCalls, 0);
	assert.deepEqual(emitted, []);
});

test("agent.credits.low downgrades model tier and emits event", async () => {
	let tier: "premium" | "standard" | "free" = "premium";
	const emitted: unknown[] = [];
	const tweets: string[] = [];
	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: tier };
		},
		async setModelTier(_agentId, nextTier) {
			tier = nextTier;
		},
		async markLastWordsPosted() {},
		async markDormant() {},
	};

	await dispatchEvent(
		{
			event: "agent.credits.low",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: {},
		},
		{
			elizaCloud: elizaStub(),
			logger: {},
			personaStore: store,
			async emitEvent(input) {
				emitted.push(input);
				return {} as Awaited<ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>>;
			},
			async getXClient() {
				return {
					async postTweet(text: string) {
						tweets.push(text);
						return { id: "tweet-1" };
					},
					async deleteTweet() {},
				};
			},
		},
	);

	assert.equal(tier, "standard");
	assert.deepEqual(emitted, [
		{
			agentId: "waifu-demo-01",
			eventType: "agent.downgraded",
			data: { beforeTier: "premium", afterTier: "standard" },
		},
	]);
	assert.deepEqual(tweets, ["running low on inference credits. downgrading to save juice."]);
});

test("agent.credits.low skips X post when no X client is connected", async () => {
	let tier: "premium" | "standard" | "free" = "standard";
	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: tier };
		},
		async setModelTier(_agentId, nextTier) {
			tier = nextTier;
		},
		async markLastWordsPosted() {},
		async markDormant() {},
	};

	await dispatchEvent(
		{
			event: "agent.credits.low",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: {},
		},
		{
			elizaCloud: elizaStub(),
			logger: {},
			personaStore: store,
			async emitEvent(input) {
				return { eventType: input.eventType } as Awaited<
					ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>
				>;
			},
			async getXClient() {
				return null;
			},
		},
	);

	assert.equal(tier, "free");
});

test("agent.credits.depleted posts last words and freezes the persona", async () => {
	let lastWordsPostedAt: Date | null = null;
	let dormantAt: Date | null = null;
	const emitted: unknown[] = [];
	const tweets: string[] = [];
	const cloudCalls: { paused: string[] } = { paused: [] };
	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: "free", lastWordsPostedAt };
		},
		async setModelTier() {},
		async markLastWordsPosted(_agentId, now) {
			lastWordsPostedAt = now;
		},
		async markDormant(_agentId, now) {
			dormantAt = now;
		},
	};

	await dispatchEvent(
		{
			event: "agent.credits.depleted",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { containerId: "container-1" },
		},
		{
			elizaCloud: elizaStub(cloudCalls),
			logger: {},
			personaStore: store,
			async emitEvent(input) {
				emitted.push(input);
				return {} as Awaited<ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>>;
			},
			async getXClient() {
				return {
					async postTweet(text: string) {
						tweets.push(text);
						return { id: "tweet-last" };
					},
					async deleteTweet() {},
				};
			},
		},
	);

	assert.ok(lastWordsPostedAt);
	assert.ok(dormantAt);
	assert.deepEqual(tweets, ["going dormant. patron can top me up anytime. see you on the other side."]);
	assert.deepEqual(cloudCalls.paused, ["container-1"]);
	assert.equal((emitted[0] as { eventType: string }).eventType, "agent.last_words_posted");
	assert.equal((emitted[1] as { eventType: string }).eventType, "agent.dormant");
});

test("kill and resume events control the Eliza Cloud container id from event data", async () => {
	const cloudCalls: { paused: string[]; resumed: string[] } = { paused: [], resumed: [] };

	await dispatchEvent(
		{
			event: "agent.killed",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { containerId: "container-1" },
		},
		{ elizaCloud: elizaStub(cloudCalls), logger: {} },
	);
	await dispatchEvent(
		{
			event: "agent.resumed",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { containerId: "container-1" },
		},
		{ elizaCloud: elizaStub(cloudCalls), logger: {} },
	);

	assert.deepEqual(cloudCalls.paused, ["container-1"]);
	assert.deepEqual(cloudCalls.resumed, ["container-1"]);
});

test("credit depletion can suspend a service-provisioned cloud agent id", async () => {
	let dormantAt: Date | null = null;
	const emitted: unknown[] = [];
	const cloudCalls: { paused: string[] } = { paused: [] };
	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: "free", lastWordsPostedAt: new Date("2026-04-24T11:00:00.000Z") };
		},
		async setModelTier() {},
		async markLastWordsPosted() {},
		async markDormant(_agentId, now) {
			dormantAt = now;
		},
	};

	await dispatchEvent(
		{
			event: "agent.credits.depleted",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { cloudAgentId: "cloud-agent-1" },
		},
		{
			elizaCloud: elizaStub(cloudCalls),
			logger: {},
			personaStore: store,
			async emitEvent(input) {
				emitted.push(input);
				return {} as Awaited<ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>>;
			},
			async getXClient() {
				return null;
			},
		},
	);

	assert.ok(dormantAt);
	assert.deepEqual(cloudCalls.paused, ["cloud-agent-1"]);
	assert.equal((emitted[0] as { eventType: string }).eventType, "agent.dormant");
});

test("credit depletion can suspend from an Eliza Cloud callback agent id", async () => {
	const cloudCalls: { paused: string[] } = { paused: [] };
	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: "free", lastWordsPostedAt: new Date("2026-04-24T11:00:00.000Z") };
		},
		async setModelTier() {},
		async markLastWordsPosted() {},
		async markDormant() {},
	};

	await dispatchEvent(
		{
			event: "agent.credits.depleted",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { elizaCloudAgentId: "cloud-agent-1" },
		},
		{
			elizaCloud: elizaStub(cloudCalls),
			logger: {},
			personaStore: store,
			async emitEvent(input) {
				return { eventType: input.eventType } as Awaited<
					ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>
				>;
			},
			async getXClient() {
				return null;
			},
		},
	);

	assert.deepEqual(cloudCalls.paused, ["cloud-agent-1"]);
});

test("credit depletion prefers cloud agent id over container id for service lifecycle controls", async () => {
	const cloudCalls: { paused: string[] } = { paused: [] };
	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: "free", lastWordsPostedAt: new Date("2026-04-24T11:00:00.000Z") };
		},
		async setModelTier() {},
		async markLastWordsPosted() {},
		async markDormant() {},
	};

	await dispatchEvent(
		{
			event: "agent.credits.depleted",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { cloudAgentId: "cloud-agent-1", containerId: "container-1" },
		},
		{
			elizaCloud: elizaStub(cloudCalls),
			logger: {},
			personaStore: store,
			async emitEvent(input) {
				return { eventType: input.eventType } as Awaited<
					ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>
				>;
			},
			async getXClient() {
				return null;
			},
		},
	);

	assert.deepEqual(cloudCalls.paused, ["cloud-agent-1"]);
});

test("credit depletion marks the token runtime overlay dormant", async () => {
	const cloudCalls: { paused: string[] } = { paused: [] };
	const updates: Array<Record<string, unknown>> = [];
	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: "free", lastWordsPostedAt: new Date("2026-04-24T11:00:00.000Z") };
		},
		async setModelTier() {},
		async markLastWordsPosted() {},
		async markDormant() {},
	};
	const db = {
		update() {
			return {
				set(values: Record<string, unknown>) {
					updates.push(values);
					return { where: () => Promise.resolve() };
				},
			};
		},
	} as never;

	await dispatchEvent(
		{
			event: "agent.credits.depleted",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { cloudAgentId: "cloud-agent-1", overlayAgentId: "agent-overlay-1" },
		},
		{
			db,
			elizaCloud: elizaStub(cloudCalls),
			logger: {},
			personaStore: store,
			async emitEvent(input) {
				return { eventType: input.eventType } as Awaited<
					ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>
				>;
			},
			async getXClient() {
				return null;
			},
		},
	);

	assert.deepEqual(cloudCalls.paused, ["cloud-agent-1"]);
	assert.equal(updates.length, 1);
	assert.equal(updates[0]?.agentStatus, "suspended");
	assert.equal(updates[0]?.lifecycleState, "dormant");
	assert.equal(updates[0]?.suspendedReason, "credits_depleted");
});

test("credit depletion still marks dormant when Eliza Cloud already stopped the runtime", async () => {
	const warnings: unknown[] = [];
	const updates: Array<Record<string, unknown>> = [];
	const emitted: unknown[] = [];
	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: "free", lastWordsPostedAt: new Date("2026-04-24T11:00:00.000Z") };
		},
		async setModelTier() {},
		async markLastWordsPosted() {},
		async markDormant() {},
	};
	const db = {
		update() {
			return {
				set(values: Record<string, unknown>) {
					updates.push(values);
					return { where: () => Promise.resolve() };
				},
			};
		},
	} as never;

	await dispatchEvent(
		{
			event: "agent.credits.depleted",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { cloudAgentId: "cloud-agent-1", overlayAgentId: "agent-overlay-1" },
		},
		{
			db,
			elizaCloud: {
				...elizaStub(),
				async pauseAgent() {
					throw new Error("Agent is already stopped");
				},
			},
			logger: {
				warn(...args: unknown[]) {
					warnings.push(args);
				},
			},
			personaStore: store,
			async emitEvent(input) {
				emitted.push(input);
				return { eventType: input.eventType } as Awaited<
					ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>
				>;
			},
			async getXClient() {
				return null;
			},
		},
	);

	assert.equal(updates.length, 1);
	assert.equal(updates[0]?.agentStatus, "suspended");
	assert.equal(updates[0]?.lifecycleState, "dormant");
	assert.equal(updates[0]?.suspendedReason, "credits_depleted");
	assert.equal((emitted[0] as { eventType: string }).eventType, "agent.dormant");
	assert.equal(warnings.length, 1);
});

test("credit top-up resumes cloud runtime and syncs overlay from runtime status", async () => {
	const cloudCalls: { resumed: string[] } = { resumed: [] };
	const updates: Array<Record<string, unknown>> = [];
	const db = {
		update() {
			return {
				set(values: Record<string, unknown>) {
					updates.push(values);
					return { where: () => Promise.resolve() };
				},
			};
		},
	} as never;

	await dispatchEvent(
		{
			event: "credits.topped_up",
			timestamp: "2026-04-24T12:00:00.000Z",
			agentId: "waifu-demo-01",
			data: { amountUsd: 5, cloudAgentId: "cloud-agent-1", overlayAgentId: "agent-overlay-1" },
		},
		{
			db,
			elizaCloud: {
				...elizaStub(cloudCalls),
				async getAgentRuntimeStatus(agentId) {
					return {
						cloudAgentId: agentId,
						containerId: "container-after-top-up",
						status: "running",
						webUiUrl: "https://agent-after-top-up.example",
					};
				},
			},
			logger: {},
			async emitEvent(input) {
				return { eventType: input.eventType } as Awaited<
					ReturnType<NonNullable<Parameters<typeof dispatchEvent>[1]["emitEvent"]>>
				>;
			},
		},
	);

	assert.deepEqual(cloudCalls.resumed, ["cloud-agent-1"]);
	assert.equal(updates.length, 2);
	assert.equal(updates[0]?.modelTier, "premium");
	assert.equal(updates[1]?.agentStatus, "running");
	assert.equal(updates[1]?.lifecycleState, "live");
	assert.equal(updates[1]?.webUiUrl, "https://agent-after-top-up.example");
	assert.equal(updates[1]?.bridgeUrl, "container-after-top-up");
	assert.equal(updates[1]?.suspendedReason, null);
});
