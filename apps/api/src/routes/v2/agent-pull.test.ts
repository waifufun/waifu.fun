import assert from "node:assert/strict";
import test from "node:test";

import type { MiddlewareHandler } from "hono";

import type { AgentPullAuthBindings } from "../../middleware/agent-pull-auth.js";
import { createAgentPullRoutes } from "./agent-pull.js";

function authFor(
	agentId: string,
	lastSeenAt = new Date("2026-04-24T12:00:00.000Z"),
): MiddlewareHandler<AgentPullAuthBindings> {
	return async (c, next) => {
		c.set("agentPersona", {
			id: "persona-id",
			agentId,
			tokenAddress: "0x0000000000000000000000000000000000000001",
			runtimeLastSeenAt: lastSeenAt,
		} as never);
		await next();
	};
}

function fakeCountDb(eventsAvailable: number) {
	return {
		select() {
			return {
				from() {
					return {
						where() {
							return Promise.resolve([{ eventsAvailable }]);
						},
					};
				},
			};
		},
	} as never;
}

test("POST /:id/heartbeat emits heartbeat and returns liveness state", async () => {
	const emitted: unknown[] = [];
	const app = createAgentPullRoutes({
		auth: authFor("waifu-demo"),
		db: fakeCountDb(3),
		async emitEvent(input) {
			emitted.push(input);
			return {} as never;
		},
	});

	const res = await app.request("/waifu-demo/heartbeat", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ status: "thinking", metadata: { loop: 7 } }),
	});

	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), {
		agentId: "waifu-demo",
		lastSeenAt: "2026-04-24T12:00:00.000Z",
		eventsAvailable: 3,
	});
	assert.equal((emitted[0] as { eventType: string }).eventType, "agent.heartbeat");
	assert.deepEqual((emitted[0] as { data: unknown }).data, {
		status: "thinking",
		metadata: { loop: 7 },
		lastSeenAt: "2026-04-24T12:00:00.000Z",
	});
});

test("POST /:id/heartbeat rejects agent id mismatch", async () => {
	const app = createAgentPullRoutes({ auth: authFor("waifu-other"), db: fakeCountDb(0) });
	const res = await app.request("/waifu-demo/heartbeat", { method: "POST" });
	assert.equal(res.status, 403);
});

test("POST /:id/heartbeat validates status", async () => {
	const app = createAgentPullRoutes({ auth: authFor("waifu-demo"), db: fakeCountDb(0) });
	const res = await app.request("/waifu-demo/heartbeat", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ status: "sleeping" }),
	});
	assert.equal(res.status, 400);
});

function fakeEventDb(rows: unknown[]) {
	return {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								orderBy() {
									return {
										limit() {
											return Promise.resolve(rows);
										},
									};
								},
							};
						},
					};
				},
			};
		},
	} as never;
}

test("GET /:id/events/pull returns ascending event page with next cursor", async () => {
	const rows = [
		{
			id: "11111111-1111-4111-8111-111111111111",
			agentId: "waifu-demo",
			eventType: "action.dispatched",
			data: { action: "swap" },
			createdAt: new Date("2026-04-24T12:00:01.000Z"),
		},
		{
			id: "22222222-2222-4222-8222-222222222222",
			agentId: "waifu-demo",
			eventType: "launch.confirmed",
			data: {},
			createdAt: new Date("2026-04-24T12:00:02.000Z"),
		},
		{
			id: "33333333-3333-4333-8333-333333333333",
			agentId: "waifu-demo",
			eventType: "agent.heartbeat",
			data: {},
			createdAt: new Date("2026-04-24T12:00:03.000Z"),
		},
	];
	const app = createAgentPullRoutes({ auth: authFor("waifu-demo"), db: fakeEventDb(rows) });

	const res = await app.request(
		"/waifu-demo/events/pull?since=2026-04-24T12:00:00.000Z&limit=2&types=action.dispatched,launch.confirmed",
	);

	assert.equal(res.status, 200);
	const body = (await res.json()) as { events: unknown[]; nextCursor: string | null };
	assert.equal(body.events.length, 2);
	assert.equal(body.nextCursor, "22222222-2222-4222-8222-222222222222");
});

test("GET /:id/events/pull validates cursor and event type filters", async () => {
	const app = createAgentPullRoutes({ auth: authFor("waifu-demo"), db: fakeEventDb([]) });
	assert.equal((await app.request("/waifu-demo/events/pull?since=not-a-cursor")).status, 400);
	assert.equal((await app.request("/waifu-demo/events/pull?types=nope")).status, 400);
});
