import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import {
	type AgentPullAuthBindings,
	createAgentPullAuth,
	extractBearerToken,
	hashRuntimeApiKey,
} from "./agent-pull-auth.js";

function fakeDb(row: Record<string, unknown> | null, updates: unknown[] = []) {
	return {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve(row ? [row] : []);
								},
							};
						},
					};
				},
			};
		},
		update() {
			return {
				set(values: unknown) {
					updates.push(values);
					return {
						where() {
							return Promise.resolve();
						},
					};
				},
			};
		},
	} as never;
}

test("extractBearerToken accepts Authorization: Bearer", () => {
	assert.equal(extractBearerToken("Bearer secret"), "secret");
	assert.equal(extractBearerToken("bearer secret"), "secret");
	assert.equal(extractBearerToken("Basic secret"), null);
});

test("hashRuntimeApiKey is deterministic sha256", () => {
	assert.equal(hashRuntimeApiKey("key"), hashRuntimeApiKey("key"));
	assert.notEqual(hashRuntimeApiKey("key"), "key");
});

test("agent pull auth sets agentPersona and updates last seen", async () => {
	const updates: unknown[] = [];
	const app = new Hono<AgentPullAuthBindings>();
	const seenAt = new Date("2026-04-24T12:00:00.000Z");
	app.use(
		"*",
		createAgentPullAuth({
			db: fakeDb({ id: "persona-id", agentId: "waifu-1", runtimeLastSeenAt: null }, updates),
			now: () => seenAt,
		}),
	);
	app.get("/", (c) => {
		const persona = c.get("agentPersona");
		return c.json({
			agentId: persona.agentId,
			lastSeenAt: (persona.runtimeLastSeenAt as Date).toISOString(),
		});
	});

	const res = await app.request("/", { headers: { authorization: "Bearer pull-key" } });
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { agentId: "waifu-1", lastSeenAt: seenAt.toISOString() });
	assert.deepEqual(updates, [{ runtimeLastSeenAt: seenAt, updatedAt: seenAt }]);
});

test("agent pull auth rejects missing and invalid keys", async () => {
	const app = new Hono<AgentPullAuthBindings>();
	app.use("*", createAgentPullAuth({ db: fakeDb(null) }));
	app.get("/", (c) => c.json({ ok: true }));

	assert.equal((await app.request("/")).status, 401);
	assert.equal((await app.request("/", { headers: { authorization: "Bearer nope" } })).status, 403);
});
