import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../src/middleware/patron-auth.js";
import { createAgentRuntimeRoutes } from "../src/routes/v2/agents-runtime.js";

const authHeaders = { authorization: "Bearer steward-token" };

afterEach(() => {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
});

function setAuthDb(agentExists: boolean) {
	const patronRow = { id: "patron-1", stewardUserId: "steward-1", primaryEmail: null };
	const agentRow = {
		id: "persona-1",
		agentId: "waifu-demo-01",
		ownerStewardUserId: "steward-1",
		ownerAddress: null,
	};
	const selectRows = [[patronRow], agentExists ? [agentRow] : [], []];

	__setRequirePatronStewardParserForTest(async () => ({ userId: "steward-1", tenantId: "waifu" }));
	__setRequirePatronDbForTest({
		select() {
			const rows = selectRows.shift() ?? [];
			return {
				from() {
					return {
						where() {
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
	} as never);
}

test("GET /v2/agents/:id/runtime returns seeded runtime state", async () => {
	setAuthDb(true);
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

	const response = await app.request("/waifu-demo-01/runtime", { headers: authHeaders });

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		state: "live",
		containerId: "eliza-agent-01",
		containerUrl: "https://eliza.example/agents/eliza-agent-01",
		lastEventAt: "2026-04-24T12:00:00.000Z",
	});
});

test("GET /v2/agents/:id/runtime returns 404 for unknown agents", async () => {
	setAuthDb(false);
	const app = createAgentRuntimeRoutes({
		db: {} as never,
		async getRuntimeState() {
			return null;
		},
	});

	const response = await app.request("/missing/runtime", { headers: authHeaders });

	assert.equal(response.status, 404);
});
