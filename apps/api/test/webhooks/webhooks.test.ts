import assert from "node:assert/strict";
import test from "node:test";

import { createWebhookRoutes, signWebhookPayload } from "../../src/routes/v2/webhooks.js";

function validPayload(idempotencyKey = "evt_1") {
	return {
		event: "agent.claimed",
		timestamp: new Date().toISOString(),
		agentId: "waifu-demo-01",
		data: { claimedByXHandle: "eliza" },
		idempotencyKey,
	};
}

test("POST /agent-events requires a signed webhook body", async () => {
	const app = createWebhookRoutes({ secret: "secret", db: fakeDb() });
	const payload = validPayload();

	const response = await app.request("/agent-events", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});

	assert.equal(response.status, 401);
});

test("POST /agent-events rejects a tampered raw body", async () => {
	const app = createWebhookRoutes({ secret: "secret", db: fakeDb() });
	const signedPayload = validPayload();
	const signedBody = JSON.stringify(signedPayload);
	const tamperedBody = JSON.stringify({ ...signedPayload, data: { claimedByXHandle: "mallory" } });

	const response = await app.request("/agent-events", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Waifu-Webhook-Signature": signBody(signedPayload, signedBody),
		},
		body: tamperedBody,
	});

	assert.equal(response.status, 401);
	assert.match(await response.text(), /signature/);
});

test("POST /agent-events validates payload shape", async () => {
	const app = createWebhookRoutes({ secret: "secret", db: fakeDb() });
	const payload = { ...validPayload(), data: [] };

	const response = await app.request("/agent-events", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Waifu-Webhook-Signature": signBody(payload),
		},
		body: JSON.stringify(payload),
	});

	assert.equal(response.status, 400);
	assert.match(await response.text(), /data must be an object/);
});

test("POST /agent-events rejects stale signed payloads", async () => {
	const app = createWebhookRoutes({ secret: "secret", db: fakeDb() });
	const payload = { ...validPayload(), timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString() };
	const response = await post(app, payload);

	assert.equal(response.status, 401);
	assert.match(await response.text(), /timestamp/);
});

test("POST /agent-events rejects signed payloads too far in the future", async () => {
	const app = createWebhookRoutes({ secret: "secret", db: fakeDb() });
	const payload = { ...validPayload(), timestamp: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
	const response = await post(app, payload);

	assert.equal(response.status, 401);
	assert.match(await response.text(), /timestamp/);
});

test("POST /agent-events requires idempotencyKey to prevent replay dispatch", async () => {
	const app = createWebhookRoutes({ secret: "secret", db: fakeDb() });
	const payload: Record<string, unknown> = validPayload();
	delete payload.idempotencyKey;
	const response = await post(app, payload);

	assert.equal(response.status, 401);
	assert.match(await response.text(), /idempotencyKey/);
});

test("POST /agent-events is idempotent by idempotencyKey", async () => {
	const calls: string[] = [];
	const db = fakeDb();
	const app = createWebhookRoutes({
		secret: "secret",
		db,
		elizaCloud: {
			async provisionAgent(input) {
				calls.push(input.agentId);
				return { containerId: "container-1" };
			},
			async pauseAgent() {},
			async resumeAgent() {},
			async deprovisionAgent() {},
		},
	});

	const payload = validPayload();
	const first = await post(app, payload);
	assert.equal(first.status, 202);
	assert.deepEqual(await first.json(), { status: "accepted", duplicate: false });

	const second = await post(app, payload);
	assert.equal(second.status, 200);
	assert.deepEqual(await second.json(), { status: "ok", duplicate: true });
	assert.deepEqual(calls, ["waifu-demo-01"]);
});

function post(app: ReturnType<typeof createWebhookRoutes>, payload: unknown) {
	const body = JSON.stringify(payload);
	return app.request("/agent-events", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Waifu-Webhook-Signature": signBody(payload, body),
		},
		body,
	});
}

function signBody(payload: unknown, body = JSON.stringify(payload)): string {
	const timestamp = (payload as { timestamp?: unknown }).timestamp;
	if (typeof timestamp !== "string") throw new Error("test payload timestamp missing");
	return signWebhookPayload(body, timestamp, "secret");
}

function fakeDb() {
	const keys = new Set<string>();
	return {
		insert() {
			return {
				values(row: { key: string | null }) {
					return {
						onConflictDoNothing() {
							return {
								returning() {
									if (!row.key || keys.has(row.key)) return Promise.resolve([]);
									keys.add(row.key);
									return Promise.resolve([{ id: "inserted" }]);
								},
							};
						},
					};
				},
			};
		},
	} as never;
}
