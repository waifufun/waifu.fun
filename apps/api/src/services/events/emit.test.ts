import assert from "node:assert/strict";
import test from "node:test";

import { metricsRegistry } from "@waifufun/metrics";

import { buildWebhookPayload, normalizeAgentEventInput, parseWebhookUrls, recordAgentEventMetrics } from "./emit.js";

test("parseWebhookUrls accepts comma and newline separated URLs", () => {
	assert.deepEqual(parseWebhookUrls(" https://a.test/hook,\nhttps://b.test/hook ,, "), [
		"https://a.test/hook",
		"https://b.test/hook",
	]);
});

test("normalizeAgentEventInput validates typed events and fills legacy queue fields", () => {
	const row = normalizeAgentEventInput({
		agentId: "waifu-demo-01",
		eventType: "token.purchased",
		data: {
			buyer: "0xabc",
			txHash: "0xdeadbeef",
			blockNumber: "123",
			chainId: "56",
		},
	});

	assert.equal(row.type, "agent.trade.buy");
	assert.deepEqual(row.payload, row.data);
	assert.equal(row.txHash, "0xdeadbeef");
	assert.equal(row.blockNumber, "123");
	assert.equal(row.chainId, "56");
});

test("normalizeAgentEventInput rejects unknown event types", () => {
	assert.throws(
		() =>
			normalizeAgentEventInput({
				agentId: "waifu-demo-01",
				eventType: "nope" as never,
				data: {},
			}),
		/invalid agent event type/,
	);
});

test("buildWebhookPayload emits the W1.7 webhook contract", () => {
	const payload = buildWebhookPayload({
		id: "4efc9f5f-7d73-447d-9f0f-d842c8b75000",
		agentId: "waifu-demo-01",
		eventType: "tax.split.configured",
		data: { feeRate: 5 },
		txHash: null,
		blockNumber: null,
		chainId: null,
		tokenAddress: null,
		type: "tax.split.configured",
		payload: { feeRate: 5 },
		status: "pending",
		attempts: 0,
		errorMessage: null,
		createdAt: new Date("2026-04-24T10:00:00.000Z"),
		processedAt: null,
	});

	assert.deepEqual(payload, {
		event: "tax.split.configured",
		timestamp: "2026-04-24T10:00:00.000Z",
		agentId: "waifu-demo-01",
		data: { feeRate: 5 },
	});
});

test("recordAgentEventMetrics increments adapter action counters", async () => {
	metricsRegistry.resetMetrics();

	recordAgentEventMetrics({
		id: "4efc9f5f-7d73-447d-9f0f-d842c8b75001",
		agentId: "waifu-demo-01",
		eventType: "action.swap",
		data: { adapter: "pancake", action: "swap" },
		txHash: null,
		blockNumber: null,
		chainId: null,
		tokenAddress: null,
		type: "action.swap",
		payload: { adapter: "pancake", action: "swap" },
		status: "done",
		attempts: 0,
		errorMessage: null,
		createdAt: new Date("2026-04-24T10:00:00.000Z"),
		processedAt: null,
	});

	const metrics = await metricsRegistry.metrics();
	assert.match(
		metrics,
		/agent_actions_total\{service="api",agentId="waifu-demo-01",adapter="pancake",action="swap"\} 1/,
	);
});
