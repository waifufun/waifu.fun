import assert from "node:assert/strict";
import test from "node:test";

import { createWebhookRoutes } from "../../src/routes/v2/webhooks.js";

const VALID_PAYLOAD = {
	event: "agent.claimed",
	timestamp: "2026-04-24T12:00:00.000Z",
	agentId: "waifu-demo-01",
	data: { claimedByXHandle: "eliza" },
	idempotencyKey: "evt_1",
};

test("POST /agent-events requires X-Waifu-Webhook-Secret", async () => {
	const app = createWebhookRoutes({ secret: "secret", db: fakeDb() });

	const response = await app.request("/agent-events", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(VALID_PAYLOAD),
	});

	assert.equal(response.status, 401);
});

test("POST /agent-events validates payload shape", async () => {
	const app = createWebhookRoutes({ secret: "secret", db: fakeDb() });

	const response = await app.request("/agent-events", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Waifu-Webhook-Secret": "secret",
		},
		body: JSON.stringify({ ...VALID_PAYLOAD, data: [] }),
	});

	assert.equal(response.status, 400);
	assert.match(await response.text(), /data must be an object/);
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

	const first = await post(app, VALID_PAYLOAD);
	assert.equal(first.status, 202);
	assert.deepEqual(await first.json(), { status: "accepted", duplicate: false });

	const second = await post(app, VALID_PAYLOAD);
	assert.equal(second.status, 200);
	assert.deepEqual(await second.json(), { status: "ok", duplicate: true });
	assert.deepEqual(calls, ["waifu-demo-01"]);
});

function post(app: ReturnType<typeof createWebhookRoutes>, payload: unknown) {
	return app.request("/agent-events", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"X-Waifu-Webhook-Secret": "secret",
		},
		body: JSON.stringify(payload),
	});
}

function fakeDb() {
	const keys = new Set<string>();
	return {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve(keys.has("evt_1") ? [{ id: "existing" }] : []);
								},
							};
						},
					};
				},
			};
		},
		insert() {
			return {
				values(row: { key: string | null }) {
					if (row.key) keys.add(row.key);
					return Promise.resolve();
				},
			};
		},
	} as never;
}
