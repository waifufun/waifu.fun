import assert from "node:assert/strict";
import test from "node:test";

import { createWebhookRoutes, resolveWebhookAgentId, signWebhookPayload } from "./webhooks.js";

test("resolveWebhookAgentId falls back to token runtime overlay for Eliza Cloud callbacks", async () => {
	let selectCalls = 0;
	const db = {
		select() {
			selectCalls += 1;
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (selectCalls === 1) return Promise.resolve([]);
									return Promise.resolve([{ agentId: "waifu-demo-01" }]);
								},
							};
						},
					};
				},
			};
		},
	};

	const agentId = await resolveWebhookAgentId(
		db as unknown as Parameters<typeof resolveWebhookAgentId>[0],
		"cloud-agent-from-overlay",
		"eliza-cloud-webhook",
	);

	assert.equal(agentId, "waifu-demo-01");
	assert.equal(selectCalls, 2);
});

test("Eliza Cloud credits webhook resolves cloudAgentId callbacks through the HTTP route", async () => {
	let selectCalls = 0;
	let inserted = false;
	const db = {
		select() {
			selectCalls += 1;
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									if (selectCalls === 1) return Promise.resolve([]);
									return Promise.resolve([{ agentId: "waifu-demo-01" }]);
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
						onConflictDoNothing() {
							return {
								returning() {
									inserted = true;
									return Promise.resolve([{ id: "inbox-row-1" }]);
								},
							};
						},
					};
				},
			};
		},
	};
	const dispatched: Array<{ event: string; agentId: string | null; data: Record<string, unknown> }> = [];
	const app = createWebhookRoutes({
		db: db as unknown as Exclude<NonNullable<Parameters<typeof createWebhookRoutes>[0]>["db"], undefined>,
		secret: "webhook-secret",
		elizaCloud: {} as Exclude<NonNullable<Parameters<typeof createWebhookRoutes>[0]>["elizaCloud"], undefined>,
		logger: console,
		dispatch: async (event) => {
			dispatched.push(event);
		},
		emitEvent: async () => ({}) as never,
	});
	const body = JSON.stringify({
		event: "credits.depleted",
		timestamp: new Date().toISOString(),
		cloudAgentId: "cloud-agent-from-overlay",
		eventId: "evt-credit-cloud-agent-id",
		creditsRemaining: 0,
	});
	const timestamp = JSON.parse(body).timestamp as string;
	const signature = signWebhookPayload(body, timestamp, "webhook-secret");

	const response = await app.request("/eliza-cloud/credits", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Eliza-Webhook-Signature": signature,
		},
		body,
	});

	assert.equal(response.status, 202, await response.clone().text());
	assert.equal(inserted, true);
	assert.equal(dispatched.length, 1);
	assert.equal(dispatched[0]?.event, "agent.credits.depleted");
	assert.equal(dispatched[0]?.agentId, "waifu-demo-01");
	assert.equal(dispatched[0]?.data.cloudAgentId, "cloud-agent-from-overlay");
});

test("Eliza Cloud low-credit webhook maps to agent credits low and dispatches downgrade path", async () => {
	let inserted = false;
	const emitted: Array<{ eventType: string; agentId?: string | null; data?: Record<string, unknown> }> = [];
	const db = {
		select() {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									return Promise.resolve([{ agentId: "waifu-demo-low" }]);
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
						onConflictDoNothing() {
							return {
								returning() {
									inserted = true;
									return Promise.resolve([{ id: "inbox-row-low" }]);
								},
							};
						},
					};
				},
			};
		},
	};
	const dispatched: Array<{ event: string; agentId: string | null; data: Record<string, unknown> }> = [];
	const app = createWebhookRoutes({
		db: db as unknown as Exclude<NonNullable<Parameters<typeof createWebhookRoutes>[0]>["db"], undefined>,
		secret: "webhook-secret",
		elizaCloud: {} as Exclude<NonNullable<Parameters<typeof createWebhookRoutes>[0]>["elizaCloud"], undefined>,
		logger: console,
		dispatch: async (event) => {
			dispatched.push(event);
		},
		emitEvent: async (event) => {
			emitted.push(event);
			return {} as never;
		},
	});
	const body = JSON.stringify({
		event: "credits.low",
		timestamp: new Date().toISOString(),
		elizaCloudAgentId: "cloud-agent-low",
		eventId: "evt-credit-low",
		creditsRemaining: 0.03,
		requiredCredits: 0.1,
	});
	const timestamp = JSON.parse(body).timestamp as string;
	const signature = signWebhookPayload(body, timestamp, "webhook-secret");

	const response = await app.request("/eliza-cloud/credits", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Eliza-Webhook-Signature": signature,
		},
		body,
	});

	assert.equal(response.status, 202, await response.clone().text());
	assert.equal(inserted, true);
	assert.equal(emitted[0]?.eventType, "agent.credits.low");
	assert.equal(emitted[0]?.agentId, "waifu-demo-low");
	assert.equal(dispatched.length, 1);
	assert.equal(dispatched[0]?.event, "agent.credits.low");
	assert.equal(dispatched[0]?.agentId, "waifu-demo-low");
	assert.equal(dispatched[0]?.data.elizaCloudAgentId, "cloud-agent-low");
	assert.equal(dispatched[0]?.data.source, "eliza-cloud-webhook");
});

test("Eliza Cloud credits webhook accepts waifu agentId with separate cloudAgentId", async () => {
	let inserted = false;
	const db = {
		select() {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									return Promise.resolve([{ agentId: "waifu-agent-1" }]);
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
						onConflictDoNothing() {
							return {
								returning() {
									inserted = true;
									return Promise.resolve([{ id: "inbox-row-waifu-id" }]);
								},
							};
						},
					};
				},
			};
		},
	};
	const dispatched: Array<{ event: string; agentId: string | null; data: Record<string, unknown> }> = [];
	const app = createWebhookRoutes({
		db: db as unknown as Exclude<NonNullable<Parameters<typeof createWebhookRoutes>[0]>["db"], undefined>,
		secret: "webhook-secret",
		elizaCloud: {} as Exclude<NonNullable<Parameters<typeof createWebhookRoutes>[0]>["elizaCloud"], undefined>,
		logger: console,
		dispatch: async (event) => {
			dispatched.push(event);
		},
		emitEvent: async () => ({}) as never,
	});
	const body = JSON.stringify({
		event: "credits.depleted",
		timestamp: new Date().toISOString(),
		eventId: "evt-waifu-agent-id",
		agentId: "waifu-agent-1",
		cloudAgentId: "cloud-agent-1",
		elizaCloudAgentId: "cloud-agent-1",
		creditsRemaining: 0,
	});
	const timestamp = JSON.parse(body).timestamp as string;
	const signature = signWebhookPayload(body, timestamp, "webhook-secret");

	const response = await app.request("/eliza-cloud/credits", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Eliza-Webhook-Signature": signature,
		},
		body,
	});

	assert.equal(response.status, 202, await response.clone().text());
	assert.equal(inserted, true);
	assert.equal(dispatched.length, 1);
	assert.equal(dispatched[0]?.event, "agent.credits.depleted");
	assert.equal(dispatched[0]?.agentId, "waifu-agent-1");
	assert.equal(dispatched[0]?.data.cloudAgentId, "cloud-agent-1");
	assert.equal(dispatched[0]?.data.elizaCloudAgentId, "cloud-agent-1");
});

test("credits webhook still accepts the legacy X-Waifu-Webhook-Signature header for backward compatibility", async () => {
	let inserted = false;
	const db = {
		select() {
			return {
				from() {
					return {
						leftJoin() {
							return this;
						},
						where() {
							return {
								limit() {
									return Promise.resolve([{ agentId: "waifu-legacy-header" }]);
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
						onConflictDoNothing() {
							return {
								returning() {
									inserted = true;
									return Promise.resolve([{ id: "inbox-row-legacy" }]);
								},
							};
						},
					};
				},
			};
		},
	};
	const dispatched: Array<{ event: string; agentId: string | null; data: Record<string, unknown> }> = [];
	const app = createWebhookRoutes({
		db: db as unknown as Exclude<NonNullable<Parameters<typeof createWebhookRoutes>[0]>["db"], undefined>,
		secret: "webhook-secret",
		elizaCloud: {} as Exclude<NonNullable<Parameters<typeof createWebhookRoutes>[0]>["elizaCloud"], undefined>,
		logger: console,
		dispatch: async (event) => {
			dispatched.push(event);
		},
		emitEvent: async () => ({}) as never,
	});
	const body = JSON.stringify({
		event: "credits.depleted",
		timestamp: new Date().toISOString(),
		eventId: "evt-legacy-header",
		cloudAgentId: "cloud-agent-legacy",
		creditsRemaining: 0,
	});
	const timestamp = JSON.parse(body).timestamp as string;
	const signature = signWebhookPayload(body, timestamp, "webhook-secret");

	const response = await app.request("/eliza-cloud/credits", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Waifu-Webhook-Signature": signature,
		},
		body,
	});

	assert.equal(response.status, 202, await response.clone().text());
	assert.equal(inserted, true);
	assert.equal(dispatched.length, 1);
	assert.equal(dispatched[0]?.event, "agent.credits.depleted");
});
