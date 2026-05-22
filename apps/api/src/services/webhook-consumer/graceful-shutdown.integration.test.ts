import assert from "node:assert/strict";
import test from "node:test";

import { resurrectAgent } from "../../routes/v2/agents.js";
import type { ElizaCloudClient } from "../eliza-client.js";
import { type WebhookConsumerDeps, type WebhookConsumerPersonaStore, dispatchEvent } from "./index.js";

function elizaStub(toppedUp: unknown[]): ElizaCloudClient {
	return {
		async provisionAgent() {
			return { containerId: "container-1" };
		},
		async pauseAgent() {},
		async resumeAgent() {},
		async deprovisionAgent() {},
		async topUpCredits(agentId, amount) {
			toppedUp.push({ agentId, amount });
		},
	};
}

test("full graceful-shutdown event cascade downgrades, sleeps, and resurrects", async () => {
	const emitted: { eventType: string }[] = [];
	const tweets: string[] = [];
	const toppedUp: unknown[] = [];
	const state: {
		modelTier: "premium" | "standard" | "free";
		lastWordsPostedAt: Date | null;
		dormantAt: Date | null;
		brainPausedAt: Date | null;
	} = {
		modelTier: "premium",
		lastWordsPostedAt: null,
		dormantAt: null,
		brainPausedAt: null,
	};

	const store: WebhookConsumerPersonaStore = {
		async get(agentId) {
			return { agentId, modelTier: state.modelTier, lastWordsPostedAt: state.lastWordsPostedAt };
		},
		async setModelTier(_agentId, tier) {
			state.modelTier = tier;
		},
		async markLastWordsPosted(_agentId, now) {
			state.lastWordsPostedAt = now;
		},
		async markDormant(_agentId, now) {
			state.dormantAt = now;
			state.brainPausedAt = now;
		},
	};

	const deps: WebhookConsumerDeps = {
		elizaCloud: elizaStub(toppedUp),
		logger: {},
		personaStore: store,
		async emitEvent(input) {
			emitted.push({ eventType: input.eventType });
			return {} as never;
		},
		async getXClient() {
			return {
				async postTweet(text: string) {
					tweets.push(text);
					return { id: `tweet-${tweets.length}` };
				},
				async deleteTweet() {},
			};
		},
	};

	await dispatchEvent(
		{
			event: "agent.credits.low",
			timestamp: new Date().toISOString(),
			agentId: "waifu-demo-01",
			data: {},
		},
		deps,
	);
	await dispatchEvent(
		{
			event: "agent.credits.depleted",
			timestamp: new Date().toISOString(),
			agentId: "waifu-demo-01",
			data: {},
		},
		deps,
	);

	const updates: Record<string, unknown>[] = [];
	const db = {
		update() {
			return {
				set(values: Record<string, unknown>) {
					updates.push(values);
					state.dormantAt = values.dormantAt as null;
					state.brainPausedAt = values.brainPausedAt as null;
					state.lastWordsPostedAt = values.lastWordsPostedAt as null;
					state.modelTier = values.modelTier as "premium";
					return { where: () => Promise.resolve() };
				},
			};
		},
	} as never;

	await resurrectAgent("waifu-demo-01", 2500, {
		db,
		elizaClient: elizaStub(toppedUp),
		async emitEvent(input) {
			emitted.push({ eventType: input.eventType });
			return {} as never;
		},
	});

	assert.deepEqual(
		emitted.map((event) => event.eventType),
		["agent.downgraded", "agent.last_words_posted", "agent.dormant", "agent.resurrected"],
	);
	assert.equal(state.modelTier, "premium");
	assert.equal(state.dormantAt, null);
	assert.equal(state.brainPausedAt, null);
	assert.equal(state.lastWordsPostedAt, null);
	assert.equal(tweets.length, 2);
	assert.deepEqual(toppedUp, [{ agentId: "waifu-demo-01", amount: 2500 }]);
	assert.equal(updates.length, 1);
});
