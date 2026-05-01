import assert from "node:assert/strict";
import test from "node:test";

import { createAgentPullAuth, hashRuntimeApiKey } from "../middleware/agent-pull-auth.js";
import { createAgentPullRoutes } from "../routes/v2/agent-pull.js";
import { provisionClaimedAgent } from "./provisioning.js";

function makeFakeDb() {
	const persona: Record<string, unknown> = {
		id: "persona-id",
		agentId: "waifu-demo",
		name: "Demo",
		claimedByXHandle: null,
		twitterHandle: null,
		taxConfig: null,
		tokenAddress: "0x0000000000000000000000000000000000000001",
		metadata: {},
		runtimeKind: "third-party-pull",
		runtimeApiKeyHash: null,
		runtimeLastSeenAt: null,
	};
	const events: Record<string, unknown>[] = [
		{
			id: "11111111-1111-4111-8111-111111111111",
			agentId: "waifu-demo",
			eventType: "launch.confirmed",
			data: {},
			createdAt: new Date("2026-04-24T12:00:01.000Z"),
		},
	];

	const db = {
		select(selection?: Record<string, unknown>) {
			return {
				from() {
					return {
						where() {
							if (selection && "eventsAvailable" in selection) {
								return Promise.resolve([{ eventsAvailable: events.length }]);
							}
							return {
								limit() {
									return Promise.resolve([persona]);
								},
								orderBy() {
									return {
										limit() {
											return Promise.resolve(events);
										},
									};
								},
							};
						},
					};
				},
			};
		},
		update() {
			return {
				set(values: Record<string, unknown>) {
					Object.assign(persona, values);
					return {
						where() {
							const promise = Promise.resolve([persona]) as Promise<Record<string, unknown>[]> & {
								returning: () => Promise<Record<string, unknown>[]>;
							};
							promise.returning = () => Promise.resolve([persona]);
							return promise;
						},
					};
				},
			};
		},
	};
	return { db: db as never, persona, events };
}

test("full third-party pull lifecycle: provision, heartbeat, pull events, close", async () => {
	const { db, persona } = makeFakeDb();
	const emitted: unknown[] = [];

	const provisioned = await provisionClaimedAgent(
		"waifu-demo",
		{},
		{
			db,
			async emitEvent(input) {
				emitted.push(input);
				return {} as never;
			},
		},
	);

	// provisionClaimedAgent has a union return type; narrow it for third-party-pull.
	type PullResult = import("./provisioning.js").PullProvisionResult;
	const pullResult = provisioned as PullResult;
	assert.equal(pullResult.heartbeatEndpoint, "/v2/agents/waifu-demo/heartbeat");
	assert.equal(pullResult.eventEndpoint, "/v2/agents/waifu-demo/events/pull");
	assert.equal(typeof pullResult.runtimeApiKey, "string");
	assert.equal(persona.runtimeApiKeyHash, hashRuntimeApiKey(pullResult.runtimeApiKey ?? ""));

	const app = createAgentPullRoutes({
		auth: createAgentPullAuth({ db }),
		db,
		async emitEvent(input) {
			emitted.push(input);
			return {} as never;
		},
	});

	const heartbeat = await app.request("/waifu-demo/heartbeat", {
		method: "POST",
		headers: { authorization: `Bearer ${provisioned.runtimeApiKey}` },
		body: JSON.stringify({ status: "live" }),
	});
	assert.equal(heartbeat.status, 200);

	const pulled = await app.request("/waifu-demo/events/pull?limit=100", {
		headers: { authorization: `Bearer ${provisioned.runtimeApiKey}` },
	});
	assert.equal(pulled.status, 200);
	const body = (await pulled.json()) as { events: unknown[]; nextCursor: string | null };
	assert.equal(body.events.length, 1);
	assert.equal(body.nextCursor, null);
});
