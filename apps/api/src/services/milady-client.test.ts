import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { MiladyCloudError, MiladyCloudNotConfiguredError, createMiladyCloudClient } from "./milady-client.js";

test("provisionAgent POSTs /api/agents with bearer auth", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/agents");
		assert.equal(init?.method, "POST");
		assert.equal((init?.headers as Record<string, string>).authorization, "Bearer key_123");
		assert.deepEqual(JSON.parse(String(init?.body)), {
			agentName: "waifu-demo-01",
			agentConfig: {
				personaId: "waifu-demo-01",
				xHandle: "milady",
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

	const client = createMiladyCloudClient({
		baseUrl: "https://cloud.test/",
		apiKey: "key_123",
		logger: {},
	});
	const result = await client.provisionAgent({
		agentId: "waifu-demo-01",
		spec: {
			personaId: "waifu-demo-01",
			xHandle: "milady",
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

test("client throws MiladyCloudNotConfiguredError when baseUrl is unset", async () => {
	const client = createMiladyCloudClient({ baseUrl: "", apiKey: "key_123", logger: {} });

	await assert.rejects(
		() => client.pauseAgent("waifu-demo-01"),
		(err) => err instanceof MiladyCloudNotConfiguredError,
	);
});

test("client logs and throws typed errors on 5xx", async () => {
	const errors: Record<string, unknown>[] = [];
	mock.method(globalThis, "fetch", async () => new Response("boom", { status: 503 }));

	const client = createMiladyCloudClient({
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
		(err) => err instanceof MiladyCloudError && err.status === 503,
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

	const client = createMiladyCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		logger: {},
	});
	await client.topUpCredits("waifu-demo-01", 2500);

	assert.equal(fetchMock.mock.callCount(), 1);
});
