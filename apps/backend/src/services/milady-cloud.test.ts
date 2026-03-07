import * as assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

type FetchCall = {
	input: RequestInfo | URL;
	init?: RequestInit;
};

const originalFetch = globalThis.fetch;

const jsonResponse = (payload: unknown, status = 200): Response =>
	new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json",
		},
	});

const loadClientModule = async () => {
	process.env.MILADY_CLOUD_API_URL = "https://milady.example";
	process.env.MILADY_CLOUD_SERVICE_KEY = "service-key";

	return import("./milady-cloud");
};

describe("MiladyCloudClient", () => {
	let calls: FetchCall[] = [];
	let responses: Response[] = [];

	beforeEach(() => {
		calls = [];
		responses = [];

		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			calls.push({ input, init });

			const response = responses.shift();
			if (!response) {
				throw new Error("No mock response configured");
			}

			return response;
		}) as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("validates required constructor params", async () => {
		const { MiladyCloudClient } = await loadClientModule();

		assert.throws(() => new MiladyCloudClient("", "service-key"), /MILADY_CLOUD_API_URL is required/);
		assert.throws(() => new MiladyCloudClient("https://milady.example", ""), /MILADY_CLOUD_SERVICE_KEY is required/);
	});

	it("constructs the expected URLs, methods, headers, and bodies", async () => {
		const { MiladyCloudClient } = await loadClientModule();
		responses.push(
			jsonResponse({ cloudAgentId: "cloud-1", status: "provisioning", jobId: "job-1" }),
			jsonResponse({ status: "running" }),
			jsonResponse({ success: true }),
			jsonResponse({ success: true, status: "running" }),
			jsonResponse({ success: true, jobId: "job-2" }),
			jsonResponse({
				uptimeHours: 12,
				estimatedDailyBurnUsd: 4.25,
				currentPeriodCostUsd: 2.75,
				fundingSource: "owner_credits",
			}),
			jsonResponse({ ok: true, timestamp: "2026-03-07T05:30:00.000Z" }),
		);

		const client = new MiladyCloudClient("https://milady.example/", "service-key");
		const cloudAgentId = "agent/123";

		await client.provisionAgent({
			tokenContractAddress: "0xabc",
			chain: "base",
			chainId: 8453,
			tokenName: "Test Agent",
			tokenTicker: "TEST",
			launchType: "native",
			character: {
				name: "Milady",
			},
			billing: {
				mode: "owner_credits",
				initialReserveUsd: 25,
			},
		});
		await client.getAgentStatus(cloudAgentId);
		await client.suspendAgent(cloudAgentId, "maintenance");
		await client.resumeAgent(cloudAgentId);
		await client.restartAgent(cloudAgentId);
		await client.getAgentUsage(cloudAgentId);
		await client.healthCheck();

		assert.equal(calls.length, 7);

		const [provisionCall, statusCall, suspendCall, resumeCall, restartCall, usageCall, healthCall] = calls as [
			FetchCall,
			FetchCall,
			FetchCall,
			FetchCall,
			FetchCall,
			FetchCall,
			FetchCall,
		];

		assert.equal(String(provisionCall.input), "https://milady.example/v1/agents");
		assert.equal(provisionCall.init?.method, "POST");
		assert.deepEqual(JSON.parse(String(provisionCall.init?.body)), {
			tokenContractAddress: "0xabc",
			chain: "base",
			chainId: 8453,
			tokenName: "Test Agent",
			tokenTicker: "TEST",
			launchType: "native",
			character: {
				name: "Milady",
			},
			billing: {
				mode: "owner_credits",
				initialReserveUsd: 25,
			},
		});

		const provisionHeaders = new Headers(provisionCall.init?.headers);
		assert.equal(provisionHeaders.get("Content-Type"), "application/json");
		assert.equal(provisionHeaders.get("X-Service-Key"), "service-key");

		assert.equal(String(statusCall.input), "https://milady.example/v1/agents/agent%2F123/status");
		assert.equal(statusCall.init?.method, "GET");

		assert.equal(String(suspendCall.input), "https://milady.example/v1/agents/agent%2F123/suspend");
		assert.equal(suspendCall.init?.method, "POST");
		assert.deepEqual(JSON.parse(String(suspendCall.init?.body)), { reason: "maintenance" });

		assert.equal(String(resumeCall.input), "https://milady.example/v1/agents/agent%2F123/resume");
		assert.equal(resumeCall.init?.method, "POST");

		assert.equal(String(restartCall.input), "https://milady.example/v1/agents/agent%2F123/restart");
		assert.equal(restartCall.init?.method, "POST");

		assert.equal(String(usageCall.input), "https://milady.example/v1/agents/agent%2F123/usage");
		assert.equal(usageCall.init?.method, "GET");

		assert.equal(String(healthCall.input), "https://milady.example/health");
		assert.equal(healthCall.init?.method, "GET");
	});

	it("retries once on 5xx responses", async () => {
		const { MiladyCloudClient } = await loadClientModule();

		responses.push(
			jsonResponse({ error: "temporary outage" }, 503),
			jsonResponse({ ok: true, timestamp: "2026-03-07T05:30:00.000Z" }),
		);

		const client = new MiladyCloudClient("https://milady.example", "service-key");
		const result = await client.healthCheck();

		assert.deepEqual(result, {
			ok: true,
			timestamp: "2026-03-07T05:30:00.000Z",
		});
		assert.equal(calls.length, 2);
	});
});
