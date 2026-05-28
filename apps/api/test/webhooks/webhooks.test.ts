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
			async topUpCredits() {},
		},
	});

	const payload = validPayload();
	const first = await post(app, payload);
	assert.equal(first.status, 202);
	assert.deepEqual(await first.json(), { status: "accepted", duplicate: false });

	const second = await post(app, payload);
	assert.equal(second.status, 200);
	assert.deepEqual(await second.json(), { status: "ok", duplicate: true });
	assert.deepEqual(calls, []);
});

test("POST /eliza-cloud/credits maps depleted credits to dormant shutdown dispatch", async () => {
	const emitted: unknown[] = [];
	const dispatched: unknown[] = [];
	const db = fakeDirectDb("waifu-demo-01");
	const payload = {
		event: "credits.depleted",
		timestamp: new Date().toISOString(),
		eventId: "eliza-credit-1",
		elizaCloudAgentId: "cloud-agent-1",
		containerId: "container-1",
		creditsRemaining: 0,
	};
	const app = createWebhookRoutes({
		secret: "secret",
		db,
		elizaCloud: elizaStub(),
		async emitEvent(input) {
			emitted.push(input);
			return {} as never;
		},
		async dispatch(event) {
			dispatched.push(event);
		},
	});

	const response = await postDirect(app, "/eliza-cloud/credits", payload);

	assert.equal(response.status, 202);
	assert.equal((emitted[0] as { agentId?: string }).agentId, "waifu-demo-01");
	assert.equal((emitted[0] as { eventType?: string }).eventType, "agent.credits.depleted");
	assert.equal((dispatched[0] as { event?: string }).event, "agent.credits.depleted");
	assert.equal((dispatched[0] as { agentId?: string }).agentId, "waifu-demo-01");
	assert.equal((dispatched[0] as { data?: Record<string, unknown> }).data?.containerId, "container-1");
});

test("POST /eliza-cloud/credits is idempotent by event id", async () => {
	const emitted: unknown[] = [];
	const dispatched: unknown[] = [];
	const db = fakeDirectDb("waifu-demo-01");
	const app = createWebhookRoutes({
		secret: "secret",
		db,
		elizaCloud: elizaStub(),
		async emitEvent(input) {
			emitted.push(input);
			return {} as never;
		},
		async dispatch(event) {
			dispatched.push(event);
		},
	});
	const payload = {
		event: "credits.depleted",
		timestamp: new Date().toISOString(),
		eventId: "eliza-credit-replay",
		elizaCloudAgentId: "cloud-agent-1",
		containerId: "container-1",
		creditsRemaining: 0,
	};

	const first = await postDirect(app, "/eliza-cloud/credits", payload);
	const second = await postDirect(app, "/eliza-cloud/credits", payload);

	assert.equal(first.status, 202);
	assert.deepEqual(await first.json(), { status: "accepted" });
	assert.equal(second.status, 200);
	assert.deepEqual(await second.json(), { status: "ok", duplicate: true });
	assert.equal(emitted.length, 1);
	assert.equal(dispatched.length, 1);
});

test("POST /eliza-cloud/credits maps low and top-up credit statuses distinctly", async () => {
	const emitted: Array<{ eventType?: string }> = [];
	const dispatched: unknown[] = [];
	const db = fakeDirectDb("waifu-demo-01");
	const app = createWebhookRoutes({
		secret: "secret",
		db,
		elizaCloud: elizaStub(),
		async emitEvent(input) {
			emitted.push(input);
			return {} as never;
		},
		async dispatch(event) {
			dispatched.push(event);
		},
	});

	const lowPayload = {
		event: "credits.low",
		timestamp: new Date().toISOString(),
		eventId: "eliza-credit-low",
		elizaCloudAgentId: "cloud-agent-1",
	};
	const topUpPayload = {
		event: "credits.topped_up",
		timestamp: new Date().toISOString(),
		eventId: "eliza-credit-topup",
		elizaCloudAgentId: "cloud-agent-1",
	};

	assert.equal((await postDirect(app, "/eliza-cloud/credits", lowPayload)).status, 202);
	assert.equal((await postDirect(app, "/eliza-cloud/credits", topUpPayload)).status, 202);
	assert.deepEqual(
		emitted.map((event) => event.eventType),
		["agent.credits.low", "credits.topped_up"],
	);
	assert.deepEqual(
		dispatched.map((event) => (event as { event?: string }).event),
		["agent.credits.low", "credits.topped_up"],
	);
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

function postDirect(app: ReturnType<typeof createWebhookRoutes>, path: string, payload: unknown) {
	const body = JSON.stringify(payload);
	return app.request(path, {
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

function elizaStub() {
	return {
		async provisionAgent() {
			return { containerId: "container-1" };
		},
		async pauseAgent() {},
		async resumeAgent() {},
		async deprovisionAgent() {},
		async topUpCredits() {},
	} as never;
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

function fakeDirectDb(agentId: string) {
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
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve([{ agentId }]);
								},
							};
						},
					};
				},
			};
		},
	} as never;
}
