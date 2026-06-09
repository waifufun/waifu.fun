import assert from "node:assert/strict";
import test from "node:test";

import { buildStewardWalletClientFromEnv, createStewardWalletClient } from "./steward-wallet-mint.js";
import { StewardClient, StewardError } from "./steward.js";

const AGENT_ID = "waifu-demo-00000000";
const EOA = "0x00000000000000000000000000000000000abcde";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

test("createStewardWalletClient mints via POST /agents when the agent is missing", async () => {
	const calls: Array<{ method: string; url: string; body: unknown }> = [];
	const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ method, url: String(url), body });
		if (method === "GET") {
			// Agent not found -> 404
			return jsonResponse({ ok: false, error: "not found" }, 404);
		}
		// POST /agents -> created, returns the agent EOA
		return jsonResponse({
			ok: true,
			data: { id: AGENT_ID, tenantId: "waifu", name: "Demo Agent", walletAddress: EOA },
		});
	}) as unknown as typeof fetch;

	const client = new StewardClient({
		baseUrl: "https://steward.example",
		apiKey: "stw_test",
		tenantId: "waifu",
		fetchImpl,
	});
	const walletClient = createStewardWalletClient(client, "waifu");
	const minted = await walletClient.ensureAgentWallet({ agentId: AGENT_ID, name: "Demo Agent", platformId: "0xtoken" });

	assert.equal(minted.walletAddress, EOA);
	assert.equal(minted.stewardAgentId, AGENT_ID);
	assert.equal(minted.tenantId, "waifu");
	assert.equal(minted.created, true);
	// Probed first (GET), then created (POST /agents).
	assert.equal(calls[0]?.method, "GET");
	assert.equal(calls[1]?.method, "POST");
	assert.ok(calls[1]?.url.endsWith("/agents"));
	assert.deepEqual(calls[1]?.body, { id: AGENT_ID, name: "Demo Agent", platformId: "0xtoken" });
});

test("createStewardWalletClient is idempotent: reuses an existing agent, no second POST", async () => {
	const calls: Array<{ method: string }> = [];
	const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
		const method = init?.method ?? "GET";
		calls.push({ method });
		if (method === "GET") {
			return jsonResponse({
				ok: true,
				data: { id: AGENT_ID, tenantId: "waifu", name: "Demo Agent", walletAddress: EOA },
			});
		}
		throw new StewardError("should not create when agent exists", 500);
	}) as unknown as typeof fetch;

	const client = new StewardClient({
		baseUrl: "https://steward.example",
		apiKey: "stw_test",
		tenantId: "waifu",
		fetchImpl,
	});
	const walletClient = createStewardWalletClient(client, "waifu");
	const reused = await walletClient.ensureAgentWallet({ agentId: AGENT_ID, name: "Demo Agent" });

	assert.equal(reused.walletAddress, EOA);
	assert.equal(reused.created, false);
	// Only the GET probe ran; no POST.
	assert.equal(calls.filter((c) => c.method === "POST").length, 0);
});

test("buildStewardWalletClientFromEnv returns null when Steward is unconfigured", () => {
	assert.equal(buildStewardWalletClientFromEnv({}), null);
	assert.equal(buildStewardWalletClientFromEnv({ STEWARD_API_URL: "https://x" }), null);
	assert.equal(buildStewardWalletClientFromEnv({ STEWARD_API_KEY: "k" }), null);
});

test("buildStewardWalletClientFromEnv builds a client when configured", () => {
	const client = buildStewardWalletClientFromEnv({
		STEWARD_API_URL: "https://steward.example",
		STEWARD_API_KEY: "stw_test",
		STEWARD_TENANT_ID: "waifu",
	});
	assert.notEqual(client, null);
	assert.equal(typeof client?.ensureAgentWallet, "function");
});
