import assert from "node:assert/strict";
import test from "node:test";

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../src/middleware/patron-auth.js";
import { createV3Routes } from "../src/routes/v3/index.js";

const OWNER = "0x00000000000000000000000000000000000000a1" as const;

function resetPatronAuthMocks() {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
}

function installCreatePatronAuth() {
	__setRequirePatronDbForTest({
		select() {
			return {
				from: () => ({
					where: () => ({
						limit: async () => [
							{
								id: "patron-1",
								stewardUserId: "steward-1",
								primaryEmail: null,
							},
						],
					}),
				}),
			};
		},
	} as never);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-1",
		tenantId: "waifu",
		address: OWNER,
	}));
}

test("POST /v3/agents creates a patron-owned persona and ignores caller-supplied IDs", async () => {
	installCreatePatronAuth();
	test.after(resetPatronAuthMocks);

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
		headers: { authorization: "Bearer test", "content-type": "application/json" },
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
	const createdAgentId = (inserted[0] as { agentId: string }).agentId;
	assert.match(createdAgentId, /^waifu-aed96123ee-demo-[0-9a-f]{8}$/);
	assert.notEqual(createdAgentId, "waifu-demo");
	assert.deepEqual(inserted[0], {
		agentId: createdAgentId,
		ownerStewardUserId: "steward-1",
		ownerAddress: OWNER,
		name: "Demo",
		bio: null,
		avatarUrl: null,
		launchpadId: "four-meme-tax",
		launchpadConfig: { kind: "four-meme-tax" },
		chain: "bsc",
		metadata: null,
	});
});

test("POST /v3/agents rejects anonymous persona creation", async () => {
	const app = createV3Routes({ db: {} as never });
	const res = await app.request("/agents", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "Demo", chain: "bsc" }),
	});
	assert.equal(res.status, 401);
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
	installCreatePatronAuth();
	test.after(resetPatronAuthMocks);

	const app = createV3Routes({ db: {} as never });
	const res = await app.request("/agents", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: JSON.stringify({ name: "Demo", chain: "arbitrum" }),
	});
	assert.equal(res.status, 400);
});
