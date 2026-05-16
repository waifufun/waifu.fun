import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { ElizaCloudError, ElizaCloudNotConfiguredError, createElizaCloudClient } from "./eliza-client.js";

test("provisionAgent POSTs /api/agents with bearer auth", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/agents");
		assert.equal(init?.method, "POST");
		assert.equal((init?.headers as Record<string, string>).authorization, "Bearer key_123");
		assert.deepEqual(JSON.parse(String(init?.body)), {
			agentName: "waifu-demo-01",
			agentConfig: {
				personaId: "waifu-demo-01",
				xHandle: "eliza",
				taxConfig: { feeRate: 5 },
				safeAddress: "0x0000000000000000000000000000000000000001",
			},
		});
		return Response.json({
			success: true,
			data: {
				agentId: "waifu-demo-01",
				agentName: "waifu-demo-01",
				jobId: "job-1",
				status: "queued",
				nodeId: "node-1",
				message: "provisioning",
			},
		});
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test/",
		apiKey: "key_123",
		logger: {},
	});
	const result = await client.provisionAgent({
		agentId: "waifu-demo-01",
		spec: {
			personaId: "waifu-demo-01",
			xHandle: "eliza",
			taxConfig: { feeRate: 5 },
			safeAddress: "0x0000000000000000000000000000000000000001",
		},
	});

	assert.deepEqual(result, {
		agentId: "waifu-demo-01",
		agentName: "waifu-demo-01",
		jobId: "job-1",
		status: "queued",
		nodeId: "node-1",
		message: "provisioning",
	});
	assert.equal(fetchMock.mock.callCount(), 1);
});

test("provisionWaifuAgent POSTs service API payload with X-Service-Key", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/v1/agents");
		assert.equal(init?.method, "POST");
		assert.equal((init?.headers as Record<string, string>)["X-Service-Key"], "svc_123");
		assert.deepEqual(JSON.parse(String(init?.body)), {
			tokenContractAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			chainId: 56,
			tokenName: "Test Waifu",
			tokenTicker: "TEST",
			launchType: "native",
			character: {
				name: "Test Waifu",
				bio: "a test agent",
				config: {
					waifuAgentId: "waifu-demo-01",
					modelDefaults: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
					settings: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
				},
			},
			billing: { mode: "owner_credits" },
		});
		return Response.json({
			cloudAgentId: "cloud-agent-1",
			characterId: "char-1",
			status: "pending",
			jobId: "job-1",
			polling: { endpoint: "/api/v1/jobs/job-1", intervalMs: 5000, expectedDurationMs: 90000 },
			token_address: "0x0000000000000000000000000000000000000004",
			token_chain: "bsc",
		});
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test/",
		serviceKey: "svc_123",
		logger: {},
	});
	const result = await client.provisionWaifuAgent?.({
		agentId: "waifu-demo-01",
		tokenContractAddress: "0x0000000000000000000000000000000000000004",
		chain: "bsc",
		chainId: 56,
		tokenName: "Test Waifu",
		tokenTicker: "TEST",
		launchType: "native",
		character: { name: "Test Waifu", bio: "a test agent" },
		modelDefaults: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
	});

	assert.deepEqual(result, {
		agentId: "waifu-demo-01",
		cloudAgentId: "cloud-agent-1",
		characterId: "char-1",
		status: "pending",
		jobId: "job-1",
		polling: { endpoint: "/api/v1/jobs/job-1", intervalMs: 5000, expectedDurationMs: 90000 },
		tokenAddress: "0x0000000000000000000000000000000000000004",
		tokenChain: "bsc",
		tokenName: null,
		tokenTicker: null,
	});
	assert.equal(fetchMock.mock.callCount(), 1);
});

test("createElizaCloudClient prefers service-key auth when configured", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
		const headers = init?.headers as Record<string, string>;
		assert.equal(headers["X-Service-Key"], "svc_123");
		assert.equal(headers.authorization, undefined);
		return Response.json({ success: true, data: { jobId: "job-1", status: "queued", message: "ok" } });
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		serviceKey: "svc_123",
		logger: {},
	});
	await client.pauseAgent("waifu-demo-01");
	assert.equal(fetchMock.mock.callCount(), 1);
});

test("client throws ElizaCloudNotConfiguredError when baseUrl is unset", async () => {
	const client = createElizaCloudClient({ baseUrl: "", apiKey: "key_123", logger: {} });

	await assert.rejects(
		() => client.pauseAgent("waifu-demo-01"),
		(err) => err instanceof ElizaCloudNotConfiguredError,
	);
});

test("client logs and throws typed errors on 5xx", async () => {
	const errors: Record<string, unknown>[] = [];
	mock.method(globalThis, "fetch", async () => new Response("boom", { status: 503 }));

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		logger: {
			error(_message, meta) {
				if (meta) errors.push(meta);
			},
		},
	});

	await assert.rejects(
		() => client.resumeAgent("waifu-demo-01"),
		(err) => err instanceof ElizaCloudError && err.status === 503,
	);
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.status, 503);
});

test("topUpCredits POSTs agent credit amount", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/agents/waifu-demo-01/credits");
		assert.equal(init?.method, "POST");
		assert.deepEqual(JSON.parse(String(init?.body)), { amount: 2500 });
		return new Response(null, { status: 204 });
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		logger: {},
	});
	await client.topUpCredits("waifu-demo-01", 2500);

	assert.equal(fetchMock.mock.callCount(), 1);
});
