import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { createAgentRuntimeRoutes } from "../src/routes/v2/agents-runtime.js";
import {
	type StewardParser,
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../src/middleware/patron-auth.js";

const OWNER_STEWARD_ID = "steward-owner";
const PATRON_ROW = {
	id: "patron-1",
	stewardUserId: OWNER_STEWARD_ID,
	primaryEmail: null,
};
const PERSONA_ROW = {
	id: "persona-1",
	agentId: "waifu-demo-01",
	ownerStewardUserId: OWNER_STEWARD_ID,
	ownerAddress: null,
};

afterEach(() => {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
});

function readDrizzleTableName(t: unknown): string | null {
	if (!t || typeof t !== "object") return null;
	const sym = Object.getOwnPropertySymbols(t).find((s) => s.description === "drizzle:Name");
	if (!sym) return null;
	const value = (t as Record<symbol, unknown>)[sym];
	return typeof value === "string" ? value : null;
}

function runtimeAuthDb() {
	return {
		select() {
			let table: string | null = null;
			const builder = {
				from(t: unknown) {
					table = readDrizzleTableName(t);
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					if (table === "patron_users") return Promise.resolve([PATRON_ROW]);
					if (table === "agent_personas") return Promise.resolve([PERSONA_ROW]);
					return Promise.resolve([]);
				},
			};
			return builder;
		},
	} as never;
}

function runtimeAuthDbWithoutAgent() {
	return {
		select() {
			let table: string | null = null;
			const builder = {
				from(t: unknown) {
					table = readDrizzleTableName(t);
					return builder;
				},
				where() {
					return builder;
				},
				limit() {
					if (table === "patron_users") return Promise.resolve([PATRON_ROW]);
					return Promise.resolve([]);
				},
			};
			return builder;
		},
	} as never;
}

function installRuntimeAuth(db = runtimeAuthDb()) {
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest((async () => ({
		userId: OWNER_STEWARD_ID,
		tenantId: "waifu",
	})) as StewardParser);
}

test("GET /v2/agents/:id/runtime returns seeded runtime state", async () => {
	installRuntimeAuth();
	const app = createAgentRuntimeRoutes({
		db: {} as never,
		async getRuntimeState(_db, agentId) {
			assert.equal(agentId, "waifu-demo-01");
			return {
				state: "live",
				containerId: "eliza-agent-01",
				containerUrl: "https://eliza.example/agents/eliza-agent-01",
				lastEventAt: "2026-04-24T12:00:00.000Z",
			};
		},
	});

	const response = await app.request("/waifu-demo-01/runtime", {
		headers: { authorization: "Bearer steward-token" },
	});

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		state: "live",
		containerId: "eliza-agent-01",
		containerUrl: "https://eliza.example/agents/eliza-agent-01",
		lastEventAt: "2026-04-24T12:00:00.000Z",
	});
});

test("GET /v2/agents/:id/runtime returns 404 for unknown agents", async () => {
	installRuntimeAuth(runtimeAuthDbWithoutAgent());
	const app = createAgentRuntimeRoutes({
		db: {} as never,
		async getRuntimeState() {
			return null;
		},
	});

	const response = await app.request("/missing/runtime", {
		headers: { authorization: "Bearer steward-token" },
	});

	assert.equal(response.status, 404);
});
