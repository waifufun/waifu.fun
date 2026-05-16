import assert from "node:assert/strict";
import test from "node:test";

import { emitAgentEvent, getWebhookSigningSecret, signWebhookPayload } from "../src/lib/emit.js";

test("worker outbound webhook emission includes event id, timestamp, and HMAC headers", async (t) => {
	const previousUrls = process.env.WEBHOOK_URLS;
	const previousSigningSecret = process.env.WEBHOOK_SIGNING_SECRET;
	const previousReceiverSecret = process.env.WEBHOOK_RECEIVER_SECRET;
	const previousFetch = globalThis.fetch;
	t.after(() => {
		restoreEnv("WEBHOOK_URLS", previousUrls);
		restoreEnv("WEBHOOK_SIGNING_SECRET", previousSigningSecret);
		restoreEnv("WEBHOOK_RECEIVER_SECRET", previousReceiverSecret);
		globalThis.fetch = previousFetch;
	});

	process.env.WEBHOOK_URLS = "https://receiver.test/agent-events";
	process.env.WEBHOOK_SIGNING_SECRET = "secret";
	delete process.env.WEBHOOK_RECEIVER_SECRET;

	const calls: Array<{ url: string; init: RequestInit }> = [];
	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response("ok", { status: 202 });
	};

	const row = {
		id: "4efc9f5f-7d73-447d-9f0f-d842c8b75000",
		agentId: "waifu-demo-01",
		eventType: "agent.reconciliation.drift",
		data: { expected: "active", actual: "paused" },
		txHash: null,
		blockNumber: null,
		chainId: null,
		tokenAddress: null,
		type: "agent.reconciliation.drift",
		payload: { expected: "active", actual: "paused" },
		status: "done",
		attempts: 0,
		errorMessage: null,
		createdAt: new Date("2026-04-24T10:00:00.000Z"),
		processedAt: null,
	};

	await emitAgentEvent({
		db: fakeDb(row),
		eventType: "agent.reconciliation.drift",
		agentId: "waifu-demo-01",
		data: { expected: "active", actual: "paused" },
	});

	assert.equal(calls.length, 1);
	const call = calls[0];
	assert.equal(call.url, "https://receiver.test/agent-events");
	const body = assertStringBody(call.init.body);
	const payload = JSON.parse(body) as Record<string, unknown>;
	const headers = call.init.headers as Record<string, string>;
	const expectedSignature = signWebhookPayload(body, "2026-04-24T10:00:00.000Z", "secret");

	assert.equal(payload.id, row.id);
	assert.equal(payload.idempotencyKey, row.id);
	assert.equal(payload.timestamp, "2026-04-24T10:00:00.000Z");
	assert.equal(headers["X-Waifu-Event-Id"], row.id);
	assert.equal(headers["X-Waifu-Timestamp"], "2026-04-24T10:00:00.000Z");
	assert.equal(headers["X-Waifu-Webhook-Signature"], expectedSignature);
	assert.equal(headers["X-Waifu-Signature"], expectedSignature);
});

test("worker outbound webhook signatures use timestamp and raw body", () => {
	const body = JSON.stringify({
		id: "4efc9f5f-7d73-447d-9f0f-d842c8b75000",
		event: "agent.reconciliation.drift",
		timestamp: "2026-04-24T10:00:00.000Z",
		agentId: "waifu-demo-01",
		data: { expected: "active", actual: "paused" },
		idempotencyKey: "4efc9f5f-7d73-447d-9f0f-d842c8b75000",
	});

	assert.equal(
		signWebhookPayload(body, "2026-04-24T10:00:00.000Z", "secret"),
		"sha256=a1b6247e4c58e7cddc3fb0a9ac57ee46a8d8d531d6ef78a0032decd40c1595ba",
	);
});

test("worker outbound webhook signing secret must be non-blank", () => {
	assert.equal(getWebhookSigningSecret("  "), null);
	assert.equal(getWebhookSigningSecret(" worker-secret "), "worker-secret");
});

function fakeDb(row: unknown) {
	return {
		insert() {
			return {
				values() {
					return {
						returning() {
							return Promise.resolve([row]);
						},
					};
				},
			};
		},
	} as never;
}

function assertStringBody(body: BodyInit | null | undefined): string {
	assert.equal(typeof body, "string");
	return body;
}

function restoreEnv(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
	} else {
		process.env[key] = value;
	}
}
