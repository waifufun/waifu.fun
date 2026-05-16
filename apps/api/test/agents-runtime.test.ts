import assert from "node:assert/strict";
import test from "node:test";

import { createAgentRuntimeRoutes } from "../src/routes/v2/agents-runtime.js";

test("GET /v2/agents/:id/runtime returns seeded runtime state", async () => {
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

	const response = await app.request("/waifu-demo-01/runtime");

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		state: "live",
		containerId: "eliza-agent-01",
		containerUrl: "https://eliza.example/agents/eliza-agent-01",
		lastEventAt: "2026-04-24T12:00:00.000Z",
	});
});

test("GET /v2/agents/:id/runtime returns 404 for unknown agents", async () => {
	const app = createAgentRuntimeRoutes({
		db: {} as never,
		async getRuntimeState() {
			return null;
		},
	});

	const response = await app.request("/missing/runtime");

	assert.equal(response.status, 404);
});
