import assert from "node:assert/strict";
import test from "node:test";

import { createV3Routes } from "../src/routes/v3/index.js";

test("POST /v3/agents creates a persona with launchpad fields", async () => {
	const inserted: unknown[] = [];
	const app = createV3Routes({
		db: {
			insert() {
				return {
					values(input: unknown) {
						inserted.push(input);
						return {
							returning: async () => [{ id: "agent-uuid", ...(input as Record<string, unknown>) }],
						};
					},
				};
			},
		} as never,
	});

	const res = await app.request("/agents", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			agent_id: "waifu-demo",
			name: "Demo",
			launchpad_id: "four-meme-tax",
			launchpad_config: { kind: "four-meme-tax" },
			chain: "bsc",
		}),
	});

	assert.equal(res.status, 201);
	const json = (await res.json()) as { ok: boolean; agent: Record<string, unknown> };
	assert.equal(json.ok, true);
	assert.equal(json.agent.launchpadId, "four-meme-tax");
	assert.deepEqual(inserted[0], {
		agentId: "waifu-demo",
		name: "Demo",
		bio: null,
		avatarUrl: null,
		launchpadId: "four-meme-tax",
		launchpadConfig: { kind: "four-meme-tax" },
		chain: "bsc",
		metadata: null,
	});
});

test("GET /v3/agents/:id/safe returns safe metadata", async () => {
	const safe = {
		id: "safe-1",
		agentId: "agent-uuid",
		chain: "bsc",
		safeAddress: "0x0000000000000000000000000000000000000001",
		zodiacModifierAddress: "0x0000000000000000000000000000000000000002",
	};
	const app = createV3Routes({
		db: {
			select() {
				return { from: () => ({ where: () => ({ limit: async () => [safe] }) }) };
			},
		} as never,
	});

	const res = await app.request("/agents/agent-uuid/safe?chain=bsc");
	assert.equal(res.status, 200);
	const json = (await res.json()) as { ok: boolean; safe: typeof safe };
	assert.equal(json.ok, true);
	assert.equal(json.safe.safeAddress, safe.safeAddress);
});

test("POST /v3/agents rejects unsupported chains", async () => {
	const app = createV3Routes({ db: {} as never });
	const res = await app.request("/agents", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "Demo", chain: "arbitrum" }),
	});
	assert.equal(res.status, 400);
});
