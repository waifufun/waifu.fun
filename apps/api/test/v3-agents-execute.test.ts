import assert from "node:assert/strict";
import test from "node:test";

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../src/middleware/patron-auth.js";
import { createV3Routes } from "../src/routes/v3/index.js";

const OWNER = "0x00000000000000000000000000000000000000a1" as const;

function resetMocks() {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
}

/**
 * Mock the patron-auth DB so `requirePatron` finds a patron and
 * `requireAgentOwnership` resolves the persona by id (owned by the patron).
 */
function installOwnershipAuth(persona: Record<string, unknown>) {
	__setRequirePatronDbForTest({
		select() {
			return {
				from: () => ({
					where: () => ({
						// requirePatron's lookup returns a patron row; ownership's lookup
						// returns the persona. Both go through select().from().where().limit().
						limit: async () => [persona],
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

// The route reads the prepared plan under the `tx` -> ext key. Build that key
// from a non-literal string so the source file never contains the bare token
// (avoids a biome-1.9.4 / esbuild formatter quirk on that identifier).
const EXT_KEY = `ex${"ternal"}`;

function preparedPersona(kind: "bankr" | "bags", simulateOnly = false) {
	return {
		id: "persona-uuid",
		agentId: "waifu-demo-abcd",
		ownerStewardUserId: "steward-1",
		ownerAddress: OWNER,
		stewardUserId: "steward-1",
		primaryEmail: null,
		primaryAddress: OWNER,
		agentLaunchStatus: "prepared",
		launchpadConfig: {
			launchPlan: {
				tx: {
					[EXT_KEY]: { kind, simulateOnly, baseUrl: "https://x", body: {} },
				},
			},
		},
	};
}

test("POST /v3/agents/:id/launch/execute runs the executor and marks the persona launched", async () => {
	const persona = preparedPersona("bankr");
	installOwnershipAuth(persona);
	test.after(resetMocks);

	const launched: { agentId: string; args: unknown }[] = [];
	const routeDb = {
		// route reads persona via agentPersonaQueries.getAgentPersonaById/ByAgentId,
		// then markLaunched. We stub the underlying drizzle calls.
		select() {
			return { from: () => ({ where: () => ({ limit: async () => [persona] }) }) };
		},
		update() {
			return {
				set(args: unknown) {
					return {
						where: () => {
							launched.push({ agentId: persona.agentId, args });
							return { returning: async () => [persona] };
						},
					};
				},
			};
		},
	};

	let executed = false;
	const app = createV3Routes({
		db: routeDb as never,
		isExternalExecutorConfigured: () => true,
		executeExternalLaunch: async (plan) => {
			executed = true;
			assert.equal((plan as { kind: string }).kind, "bankr");
			return { tokenAddress: "0xtoken", curveAddress: "0xpool", txHash: "0xhash", chain: "base", raw: {} };
		},
	});

	const res = await app.request("/agents/persona-uuid/launch/execute", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: "{}",
	});

	assert.equal(res.status, 200);
	const json = (await res.json()) as Record<string, unknown>;
	assert.equal(json.ok, true);
	assert.equal(json.tokenAddress, "0xtoken");
	assert.equal(json.txHash, "0xhash");
	assert.equal(executed, true);
	assert.equal(launched.length, 1);
});

test("execute refuses a simulateOnly prepared plan", async () => {
	const persona = preparedPersona("bags", true);
	installOwnershipAuth(persona);
	test.after(resetMocks);

	const app = createV3Routes({
		db: {
			select() {
				return { from: () => ({ where: () => ({ limit: async () => [persona] }) }) };
			},
		} as never,
		isExternalExecutorConfigured: () => true,
		executeExternalLaunch: async () => {
			throw new Error("should not be called");
		},
	});

	const res = await app.request("/agents/persona-uuid/launch/execute", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: "{}",
	});
	assert.equal(res.status, 409);
	const json = (await res.json()) as Record<string, unknown>;
	assert.equal(json.ok, false);
	assert.match(String(json.error), /simulateOnly/);
});

test("execute returns 503 when the executor is not configured", async () => {
	const persona = preparedPersona("bags");
	installOwnershipAuth(persona);
	test.after(resetMocks);

	const app = createV3Routes({
		db: {
			select() {
				return { from: () => ({ where: () => ({ limit: async () => [persona] }) }) };
			},
		} as never,
		isExternalExecutorConfigured: () => false,
		executeExternalLaunch: async () => {
			throw new Error("should not be called");
		},
	});

	const res = await app.request("/agents/persona-uuid/launch/execute", {
		method: "POST",
		headers: { authorization: "Bearer test", "content-type": "application/json" },
		body: "{}",
	});
	assert.equal(res.status, 503);
});
