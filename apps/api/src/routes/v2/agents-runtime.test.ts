import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import type { Database } from "@waifufun/db/client";

import { __setRequirePatronDbForTest, __setRequirePatronStewardParserForTest } from "../../middleware/patron-auth.js";
import { type AgentRuntimeState, createAgentRuntimeRoutes } from "./agents-runtime.js";

const PATRON_ROW = {
	id: "patron-row-1",
	stewardUserId: "steward-user-1",
	primaryEmail: "patron@example.test",
};

const PERSONA_ROW = {
	id: "11111111-1111-4111-8111-111111111111",
	agentId: "waifu-runtime-1",
	ownerStewardUserId: "steward-user-1",
	ownerAddress: "0x0000000000000000000000000000000000000001",
};

afterEach(() => {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
});

function authHeaders() {
	return { authorization: "Bearer steward-test" };
}

function createAuthDb(options: { updates?: Array<Record<string, unknown>>; missPersonaIdLookup?: boolean } = {}) {
	let selectCount = 0;
	return {
		select() {
			selectCount += 1;
			const rows =
				selectCount === 1 ? [PATRON_ROW] : options.missPersonaIdLookup && selectCount === 2 ? [] : [PERSONA_ROW];
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
		update() {
			return {
				set(values: Record<string, unknown>) {
					options.updates?.push(values);
					return {
						where() {
							return Promise.resolve();
						},
					};
				},
			};
		},
	} as unknown as Database;
}

function installAuth(db: Database) {
	__setRequirePatronDbForTest(db);
	__setRequirePatronStewardParserForTest(async () => ({
		userId: "steward-user-1",
		email: "patron@example.test",
		tenantId: "waifu",
		wallets: [{ address: "0x0000000000000000000000000000000000000001", chainNamespace: "eip155" }],
	}));
}

function runtimeState(overrides: Partial<AgentRuntimeState> = {}): AgentRuntimeState {
	return {
		state: "live",
		cloudAgentId: "cloud-agent-1",
		runtimeAgentId: "cloud-agent-1",
		containerId: "container-1",
		webUiUrl: "https://agent.example",
		...overrides,
	};
}

test("PUT /:id/runtime restarts an Eliza Cloud hosted agent through the service API", async () => {
	const db = createAuthDb();
	installAuth(db);
	const calls: string[] = [];
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async () => runtimeState(),
		elizaClient: {
			async pauseAgent() {
				throw new Error("restart should use hosted restart when available");
			},
			async resumeAgent() {
				throw new Error("restart should use hosted restart when available");
			},
			async restartHostedAgent(agentId) {
				calls.push(`restart:${agentId}`);
				return { ok: true };
			},
			async getAgentRuntimeStatus(agentId) {
				calls.push(`status:${agentId}`);
				return { cloudAgentId: agentId, status: "running", webUiUrl: "https://agent.example" };
			},
		},
	});

	const res = await app.request(`/${PERSONA_ROW.id}/runtime`, {
		method: "PUT",
		headers: { ...authHeaders(), "content-type": "application/json" },
		body: JSON.stringify({ action: "restart" }),
	});

	assert.equal(res.status, 200);
	const body = (await res.json()) as { ok: boolean; cloudAgentId: string; status?: { status?: string } };
	assert.equal(body.ok, true);
	assert.equal(body.cloudAgentId, "cloud-agent-1");
	assert.equal(body.status?.status, "running");
	assert.deepEqual(calls, ["restart:cloud-agent-1", "status:cloud-agent-1"]);
});

test("PUT /:id/runtime suspends an Eliza Cloud hosted agent through the service API", async () => {
	const db = createAuthDb();
	installAuth(db);
	const calls: string[] = [];
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async () => runtimeState(),
		elizaClient: {
			async pauseAgent(agentId) {
				calls.push(`pause:${agentId}`);
				return { ok: true };
			},
			async resumeAgent() {
				throw new Error("suspend must not resume");
			},
			async getAgentRuntimeStatus(agentId) {
				calls.push(`status:${agentId}`);
				return { cloudAgentId: agentId, status: "suspended" };
			},
		},
	});

	const res = await app.request(`/${PERSONA_ROW.id}/runtime`, {
		method: "PUT",
		headers: { ...authHeaders(), "content-type": "application/json" },
		body: JSON.stringify({ action: "suspend" }),
	});

	assert.equal(res.status, 200);
	const body = (await res.json()) as { ok: boolean; action: string; cloudAgentId: string };
	assert.equal(body.ok, true);
	assert.equal(body.action, "suspend");
	assert.equal(body.cloudAgentId, "cloud-agent-1");
	assert.deepEqual(calls, ["pause:cloud-agent-1", "status:cloud-agent-1"]);
});

test("PUT /:id/runtime rejects unsupported actions with 400", async () => {
	const db = createAuthDb();
	installAuth(db);
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async () => runtimeState(),
		elizaClient: {
			async pauseAgent() {
				throw new Error("unsupported action must not reach the control plane");
			},
			async resumeAgent() {
				throw new Error("unsupported action must not reach the control plane");
			},
		},
	});

	const res = await app.request(`/${PERSONA_ROW.id}/runtime`, {
		method: "PUT",
		headers: { ...authHeaders(), "content-type": "application/json" },
		body: JSON.stringify({ action: "explode" }),
	});

	assert.equal(res.status, 400);
	const body = (await res.json()) as { ok: boolean; error: string };
	assert.equal(body.ok, false);
	assert.equal(body.error, "UNSUPPORTED_ACTION");
});

test("POST /:id/runtime/test returns hosted runtime status and web UI evidence", async () => {
	const db = createAuthDb();
	installAuth(db);
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async () => runtimeState({ webUiUrl: null as never }),
		elizaClient: {
			async pauseAgent() {
				return {};
			},
			async resumeAgent() {
				return {};
			},
			async getAgentRuntimeStatus(agentId) {
				return { cloudAgentId: agentId, status: "ready", webUiUrl: "https://public-agent.example" };
			},
		},
	});

	const res = await app.request(`/${PERSONA_ROW.id}/runtime/test`, {
		method: "POST",
		headers: authHeaders(),
	});

	assert.equal(res.status, 200);
	const body = (await res.json()) as { ok: boolean; running: boolean; hasWebUiUrl: boolean; webUiUrl: string };
	assert.equal(body.ok, true);
	assert.equal(body.running, true);
	assert.equal(body.hasWebUiUrl, true);
	assert.equal(body.webUiUrl, "https://public-agent.example");
});

test("POST /:id/runtime/rotate-key stores only the new runtime key hash", async () => {
	const updates: Array<Record<string, unknown>> = [];
	const db = createAuthDb({ updates });
	installAuth(db);
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async () => runtimeState(),
	});

	const res = await app.request(`/${PERSONA_ROW.id}/runtime/rotate-key`, {
		method: "POST",
		headers: authHeaders(),
	});

	assert.equal(res.status, 200);
	const body = (await res.json()) as { ok: boolean; agentId: string; runtimeApiKey: string };
	assert.equal(body.ok, true);
	assert.equal(body.agentId, "waifu-runtime-1");
	assert.match(body.runtimeApiKey, /^wap_/);
	assert.equal(updates.length, 1);
	assert.equal(typeof updates[0]?.runtimeApiKeyHash, "string");
	assert.notEqual(updates[0]?.runtimeApiKeyHash, body.runtimeApiKey);
	assert.ok(updates[0]?.updatedAt instanceof Date);
});

test("PUT /:id/runtime returns 409 before control when no cloud runtime exists", async () => {
	const db = createAuthDb();
	installAuth(db);
	let called = false;
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async () => ({
			state: "pending",
			webUiUrl: "https://agent.example",
		}),
		elizaClient: {
			async pauseAgent() {
				called = true;
				return {};
			},
			async resumeAgent() {
				called = true;
				return {};
			},
		},
	});

	const res = await app.request(`/${PERSONA_ROW.id}/runtime`, {
		method: "PUT",
		headers: { ...authHeaders(), "content-type": "application/json" },
		body: JSON.stringify({ action: "resume" }),
	});

	assert.equal(res.status, 409);
	const body = (await res.json()) as { ok: boolean; error: string };
	assert.equal(body.ok, false);
	assert.equal(body.error, "RUNTIME_NOT_PROVISIONED");
	assert.equal(called, false);
});

test("GET /:id/runtime returns seeded runtime state", async () => {
	const db = createAuthDb();
	installAuth(db);
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async (_db, agentId) => {
			assert.equal(agentId, "waifu-runtime-1");
			return {
				state: "live",
				containerId: "eliza-agent-01",
				containerUrl: "https://eliza.example/agents/eliza-agent-01",
				lastEventAt: "2026-04-24T12:00:00.000Z",
			} as AgentRuntimeState;
		},
	});

	const res = await app.request(`/${PERSONA_ROW.id}/runtime`, { headers: authHeaders() });
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), {
		state: "live",
		containerId: "eliza-agent-01",
		containerUrl: "https://eliza.example/agents/eliza-agent-01",
		lastEventAt: "2026-04-24T12:00:00.000Z",
	});
});

test("GET /:id/runtime accepts the stable agent slug ownership fallback", async () => {
	const db = createAuthDb();
	installAuth(db);
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async (_db, agentId) => {
			assert.equal(agentId, "waifu-runtime-1");
			return {
				state: "live",
				runtimeAgentId: "cloud-agent-1",
				webUiUrl: "https://eliza.example/agents/cloud-agent-1",
			} as AgentRuntimeState;
		},
	});

	const res = await app.request("/waifu-runtime-1/runtime", { headers: authHeaders() });
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), {
		state: "live",
		runtimeAgentId: "cloud-agent-1",
		webUiUrl: "https://eliza.example/agents/cloud-agent-1",
	});
});

test("GET /:id/runtime returns 404 when no runtime state exists", async () => {
	const db = createAuthDb();
	installAuth(db);
	const app = createAgentRuntimeRoutes({
		db,
		getRuntimeState: async () => null,
	});

	const res = await app.request(`/${PERSONA_ROW.id}/runtime`, { headers: authHeaders() });
	assert.equal(res.status, 404);
});
