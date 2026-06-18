import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { ElizaCloudUnavailableError } from "@waifufun/resilience";

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../src/middleware/patron-auth.js";
import { createAgentRuntimeRoutes } from "../src/routes/v2/agents-runtime.js";

const authHeaders = { authorization: "Bearer steward-token", "content-type": "application/json" };

afterEach(() => {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
});

/** Mirror agents-runtime.test.ts auth-db harness: patron row, then the owned agent row. */
function setAuthDb() {
	const patronRow = { id: "patron-1", stewardUserId: "steward-1", primaryEmail: null };
	const agentRow = { id: "persona-1", agentId: "waifu-demo-01", ownerStewardUserId: "steward-1", ownerAddress: null };
	const selectRows = [[patronRow], [agentRow], []];
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

test("PUT /:id/runtime → 503 + RUNTIME_CONTROL_UNAVAILABLE when circuit is open", async () => {
	setAuthDb();
	const app = createAgentRuntimeRoutes({
		db: {} as never,
		async getRuntimeState() {
			return { state: "live", cloudAgentId: "cloud-1" };
		},
		elizaClient: {
			async pauseAgent() {
				throw new ElizaCloudUnavailableError("down", { circuitName: "test" });
			},
			async resumeAgent() {
				throw new ElizaCloudUnavailableError("down", { circuitName: "test" });
			},
			async getAgentRuntimeStatus() {
				return {};
			},
		},
	});

	const response = await app.request("/waifu-demo-01/runtime", {
		method: "PUT",
		headers: authHeaders,
		body: JSON.stringify({ action: "suspend" }),
	});

	assert.equal(response.status, 503);
	const body = (await response.json()) as Record<string, unknown>;
	assert.equal(body.error, "RUNTIME_CONTROL_UNAVAILABLE");
	assert.equal(body.code, "RUNTIME_CONTROL_UNAVAILABLE");
	assert.equal(typeof body.remediation, "string");
	assert.ok((body.remediation as string).length > 0, "remediation hint must be present");
	assert.equal(body.retryAfterSeconds, 30);
});

test("PUT /:id/runtime → 502 (not 503) for a non-circuit upstream error", async () => {
	setAuthDb();
	const app = createAgentRuntimeRoutes({
		db: {} as never,
		async getRuntimeState() {
			return { state: "live", cloudAgentId: "cloud-1" };
		},
		elizaClient: {
			async pauseAgent() {
				throw new Error("some other transport error");
			},
			async resumeAgent() {
				throw new Error("some other transport error");
			},
			async getAgentRuntimeStatus() {
				return {};
			},
		},
	});

	const response = await app.request("/waifu-demo-01/runtime", {
		method: "PUT",
		headers: authHeaders,
		body: JSON.stringify({ action: "suspend" }),
	});

	assert.equal(response.status, 502);
	const body = (await response.json()) as Record<string, unknown>;
	assert.equal(body.error, "RUNTIME_CONTROL_FAILED");
});
