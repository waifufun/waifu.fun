import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { ElizaCloudUnavailableError } from "@waifufun/resilience";

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../src/middleware/patron-auth.js";
import app, { __setAgentsRouteDepsForTest } from "../src/routes/v2/agents.js";

const authHeaders = { authorization: "Bearer steward-token", "content-type": "application/json" };

afterEach(() => {
	__setAgentsRouteDepsForTest({});
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
});

/**
 * requirePatron + requireAgentOwnership read, in order: the patron row, then the
 * owned-agent row (ownerStewardUserId must match the parsed steward user). Mirror
 * the proven harness from agents-runtime-503.test.ts.
 */
function setOwnershipAuthDb(): void {
	const patronRow = { id: "patron-1", stewardUserId: "steward-1", primaryEmail: null };
	const agentRow = {
		id: "persona-1",
		agentId: "waifu-demo-01",
		ownerStewardUserId: "steward-1",
		ownerAddress: null,
	};
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

test("POST /:id/resurrect → 503 + CREDITS_UNAVAILABLE when the circuit is open", async () => {
	setOwnershipAuthDb();
	__setAgentsRouteDepsForTest({
		db: {} as never,
		// The route's inline eliza client is wrapped; on an open circuit its credit
		// top-up throws ElizaCloudUnavailableError. Inject resurrectAgent to simulate
		// exactly that surfaced error without standing up the real breaker.
		resurrectAgent: async () => {
			throw new ElizaCloudUnavailableError("down", { circuitName: "test" });
		},
	});

	const response = await app.request("/waifu-demo-01/resurrect", {
		method: "POST",
		headers: authHeaders,
		body: JSON.stringify({ creditsAmount: 500 }),
	});

	assert.equal(response.status, 503);
	const body = (await response.json()) as Record<string, unknown>;
	assert.equal(body.error, "CREDITS_UNAVAILABLE");
	assert.equal(body.code, "CREDITS_UNAVAILABLE");
	assert.equal(typeof body.remediation, "string");
	assert.ok((body.remediation as string).length > 0, "remediation hint must be present");
	assert.equal(body.retryAfterSeconds, 30);
});

test("POST /:id/resurrect → 500 (not 503) for a non-circuit error", async () => {
	setOwnershipAuthDb();
	__setAgentsRouteDepsForTest({
		db: {} as never,
		resurrectAgent: async () => {
			throw new Error("some other failure");
		},
	});

	const response = await app.request("/waifu-demo-01/resurrect", {
		method: "POST",
		headers: authHeaders,
		body: JSON.stringify({ creditsAmount: 500 }),
	});

	assert.equal(response.status, 500);
	const body = (await response.json()) as Record<string, unknown>;
	assert.equal(body.error, "failed to resurrect agent");
});
