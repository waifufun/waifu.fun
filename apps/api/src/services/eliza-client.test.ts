import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
	ElizaCloudError,
	ElizaCloudNotConfiguredError,
	createElizaCloudClient,
	resolveElizaCloudApiKey,
} from "./eliza-client.js";

test("resolveElizaCloudApiKey accepts official ElizaOS Cloud env aliases", () => {
	const previous = {
		ELIZA_CLOUD_API_KEY: process.env.ELIZA_CLOUD_API_KEY,
		ELIZAOS_CLOUD_API_KEY: process.env.ELIZAOS_CLOUD_API_KEY,
		ELIZAOS_API_KEY: process.env.ELIZAOS_API_KEY,
		ELIZACLOUD_API_KEY: process.env.ELIZACLOUD_API_KEY,
	};
	try {
		delete process.env.ELIZA_CLOUD_API_KEY;
		process.env.ELIZAOS_CLOUD_API_KEY = "elizaos_cloud_key";
		process.env.ELIZAOS_API_KEY = "elizaos_key";
		process.env.ELIZACLOUD_API_KEY = "legacy_key";
		assert.equal(resolveElizaCloudApiKey(), "elizaos_cloud_key");
		delete process.env.ELIZAOS_CLOUD_API_KEY;
		assert.equal(resolveElizaCloudApiKey(), "elizaos_key");
		delete process.env.ELIZAOS_API_KEY;
		assert.equal(resolveElizaCloudApiKey(), "legacy_key");
		process.env.ELIZA_CLOUD_API_KEY = "waifu_key";
		assert.equal(resolveElizaCloudApiKey(), "waifu_key");
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});

test("provisionAgent creates an Eliza Cloud app agent with bearer auth", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/v1/app/agents");
		assert.equal(init?.method, "POST");
		assert.equal((init?.headers as Record<string, string>).authorization, "Bearer key_123");
		assert.deepEqual(JSON.parse(String(init?.body)), {
			name: "waifu-demo-01",
			metadata: {
				personaId: "waifu-demo-01",
				xHandle: "eliza",
				taxConfig: { feeRate: 5 },
				safeAddress: "0x0000000000000000000000000000000000000001",
			},
		});
		return Response.json({
			success: true,
			agent: {
				id: "cloud-agent-1",
				name: "waifu-demo-01",
				status: "created",
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
		agentId: "cloud-agent-1",
		agentName: "waifu-demo-01",
		jobId: "",
		status: "created",
		nodeId: "",
		message: "agent created",
	});
	assert.equal(fetchMock.mock.callCount(), 1);
});

test("provisionWaifuAgent creates a wallet-owned cloud agent with service auth", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/v1/agents");
		assert.equal(init?.method, "POST");
		assert.equal((init?.headers as Record<string, string>)["X-Service-Key"], "svc_123");
		assert.equal((init?.headers as Record<string, string>)["X-API-Key"], "svc_123");
		const body = JSON.parse(String(init?.body));
		assert.deepEqual(body, {
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
					account: {
						primaryWalletAddress: "0x0000000000000000000000000000000000000009",
						walletKeyRef: "steward:waifu-demo-01",
					},
				},
			},
			billing: { mode: "owner_credits", initialReserveUsd: 5 },
			account: {
				primaryWalletAddress: "0x0000000000000000000000000000000000000009",
				chainType: "evm",
			},
			access: {
				guestTokenThreshold: 1000,
				userTokenThreshold: 100000,
				adminWalletAddress: "0x0000000000000000000000000000000000000001",
				roles: {
					guest: { minTokens: 1000, comparison: "gt" },
					user: { minTokens: 100000, comparison: "gt" },
					admin: { wallets: ["0x0000000000000000000000000000000000000001"] },
				},
			},
			container: {
				image: "ecr.test/waifu-agent:latest",
				env: {
					WAIFU_AGENT_ID: "waifu-demo-01",
					TOKEN_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000004",
					TOKEN_CHAIN: "bsc",
					TOKEN_CHAIN_ID: "56",
					TOKEN_NAME: "Test Waifu",
					TOKEN_TICKER: "TEST",
					WAIFU_BILLING_MODE: "owner_credits",
					WAIFU_INITIAL_CREDIT_USD: "5",
					WAIFU_ACCESS_GUEST_MIN_TOKENS: "1000",
					WAIFU_ACCESS_USER_MIN_TOKENS: "100000",
					WAIFU_ACCESS_THRESHOLD_MODE: "strict_gt",
					WAIFU_ACCESS_ADMIN_WALLETS: "0x0000000000000000000000000000000000000001",
					WAIFU_AGENT_EVM_ADDRESS: "0x0000000000000000000000000000000000000009",
					WAIFU_AGENT_EVM_KEY_REF: "steward:waifu-demo-01",
					ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b",
				},
			},
			modelDefaults: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
		});
		return Response.json({
			success: true,
			cloudAgentId: "cloud-agent-1",
			characterId: "character-1",
			status: "pending",
			jobId: "job-1",
			polling: { endpoint: "/api/v1/jobs/job-1", intervalMs: 5000, expectedDurationMs: 90000 },
			account: {
				primaryWalletAddress: "0x0000000000000000000000000000000000000009",
				organizationId: "org-wallet-1",
				userId: "user-wallet-1",
				isNewAccount: true,
				initialFreeCreditsUsd: 5,
			},
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
		account: {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			walletKeyRef: "steward:waifu-demo-01",
		},
		access: {
			adminWallets: ["0x0000000000000000000000000000000000000001"],
		},
		container: { imageUri: "ecr.test/waifu-agent:latest" },
		modelDefaults: { ELIZAOS_CLOUD_SMALL_MODEL: "openai/gpt-oss-120b" },
	});

	assert.deepEqual(result, {
		agentId: "waifu-demo-01",
		cloudAgentId: "cloud-agent-1",
		characterId: "character-1",
		status: "pending",
		jobId: "job-1",
		account: {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			organizationId: "org-wallet-1",
			userId: "user-wallet-1",
			isNewAccount: true,
			initialFreeCreditsUsd: 5,
		},
		polling: { endpoint: "/api/v1/jobs/job-1", intervalMs: 5000, expectedDurationMs: 90000 },
		tokenAddress: "0x0000000000000000000000000000000000000004",
		tokenChain: "bsc",
		tokenName: "Test Waifu",
		tokenTicker: "TEST",
	});
	assert.equal(fetchMock.mock.callCount(), 1);
});

test("provisionWaifuAgent surfaces wallet provisioning returned by Eliza Cloud", async () => {
	const cloudAgentId = "123e4567-e89b-12d3-a456-426614174000";
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/v1/agents");
		assert.equal(init?.method, "POST");
		assert.deepEqual(JSON.parse(String(init?.body)).account, {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			chainType: "evm",
		});
		return Response.json({
			success: true,
			cloudAgentId,
			characterId: cloudAgentId,
			status: "pending",
			walletProvisioning: {
				id: "wallet-row-1",
				address: "0x0000000000000000000000000000000000000009",
				chainType: "evm",
				clientAddress: "0x0000000000000000000000000000000000000009",
			},
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
		character: { name: "Test Waifu" },
		account: {
			primaryWalletAddress: "0x0000000000000000000000000000000000000009",
			walletKeyRef: "steward:waifu-demo-01",
		},
		container: { imageUri: "ecr.test/waifu-agent:latest" },
	});

	assert.equal(fetchMock.mock.callCount(), 1);
	assert.equal(result?.cloudAgentId, cloudAgentId);
	assert.deepEqual(result?.walletProvisioning, {
		id: "wallet-row-1",
		address: "0x0000000000000000000000000000000000000009",
		chainType: "evm",
		clientAddress: "0x0000000000000000000000000000000000000009",
	});
});

test("createElizaCloudClient uses service-key agent controls when configured", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/v1/agents/waifu-demo-01/suspend");
		assert.equal(init?.method, "POST");
		const headers = init?.headers as Record<string, string>;
		assert.equal(headers["X-Service-Key"], "svc_123");
		assert.equal(headers.authorization, undefined);
		assert.deepEqual(JSON.parse(String(init?.body)), { reason: "waifu runtime pause" });
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

test("createElizaCloudClient uses service-key agent status when configured", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/v1/agents/waifu-demo-01/status");
		assert.equal(init?.method, "GET");
		const headers = init?.headers as Record<string, string>;
		assert.equal(headers["X-Service-Key"], "svc_123");
		return Response.json({
			success: true,
			data: {
				cloudAgentId: "waifu-demo-01",
				containerId: "container-1",
				containerUrl: "https://agent.example",
				status: "running",
			},
		});
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		serviceKey: "svc_123",
		logger: {},
	});
	const result = await client.getAgentRuntimeStatus?.("waifu-demo-01");

	assert.equal(fetchMock.mock.callCount(), 1);
	assert.equal(result?.status, "running");
	assert.equal(result?.containerUrl, "https://agent.example");
});

test("provisionWaifuAgent requires the agent EVM wallet before creating cloud resources", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async () => {
		throw new Error("provisioning should not call Eliza Cloud without an agent wallet");
	});
	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test/",
		serviceKey: "svc_123",
		logger: {},
	});

	await assert.rejects(
		async () => {
			if (!client.provisionWaifuAgent) throw new Error("missing provisionWaifuAgent");
			await client.provisionWaifuAgent({
				agentId: "waifu-demo-01",
				tokenContractAddress: "0x0000000000000000000000000000000000000004",
				chain: "bsc",
				chainId: 56,
				tokenName: "Test Waifu",
				tokenTicker: "TEST",
				launchType: "native",
				character: { name: "Test Waifu" },
				container: { imageUri: "ecr.test/waifu-agent:latest" },
			});
		},
		(err: unknown) => err instanceof ElizaCloudNotConfiguredError && /agent EVM wallet is required/.test(err.message),
	);
	assert.equal(fetchMock.mock.callCount(), 0);
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

test("topUpCredits POSTs agent credit amount in Eliza Cloud dollar units", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/v1/credits/checkout");
		assert.equal(init?.method, "POST");
		const body = JSON.parse(String(init?.body));
		assert.equal(body.credits, 25);
		assert.equal(body.agent_id, "waifu-demo-01");
		return Response.json({ success: true, data: { url: "https://checkout.example/org", sessionId: "cs_org" } });
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		logger: {},
	});
	const result = await client.topUpCredits("waifu-demo-01", 25);

	assert.equal(fetchMock.mock.callCount(), 1);
	assert.ok(result);
	assert.equal(result.url, "https://checkout.example/org");
});

test("organization credit balance and checkout verification call Eliza Cloud credit APIs", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		if (String(url) === "https://cloud.test/api/v1/credits/balance?fresh=true&agent_id=cloud-agent-1") {
			assert.equal(init?.method, "GET");
			return Response.json({ success: true, balance: 4.5 });
		}
		assert.equal(init?.method, "POST");
		assert.equal(String(url), "https://cloud.test/api/billing/checkout/verify");
		assert.deepEqual(JSON.parse(String(init?.body)), {
			session_id: "cs_org",
			from: "waifu-agent-runtime",
		});
		return Response.json({
			success: true,
			balance: 9.5,
			alreadyApplied: false,
		});
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		logger: {},
	});
	const balance = await client.getCreditBalance?.("cloud-agent-1");
	const verified = await client.verifyCreditCheckout?.("cs_org");

	assert.equal(fetchMock.mock.callCount(), 2);
	assert.deepEqual(balance, {
		success: true,
		balance: 4.5,
		isLow: true,
	});
	assert.deepEqual(verified, {
		success: true,
		balance: 9.5,
		alreadyApplied: false,
	});
});

test("topUpAppCredits POSTs app credit checkout amount", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(String(url), "https://cloud.test/api/v1/app-credits/checkout");
		assert.equal(init?.method, "POST");
		const body = JSON.parse(String(init?.body));
		assert.equal(body.app_id, "cloud-app-01");
		assert.equal(body.amount, 5);
		assert.equal(typeof body.success_url, "string");
		assert.equal(typeof body.cancel_url, "string");
		return Response.json({ success: true, data: { url: "https://checkout.example/app", sessionId: "cs_app" } });
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		logger: {},
	});
	const result = await client.topUpAppCredits?.("cloud-app-01", 5);

	assert.equal(fetchMock.mock.callCount(), 1);
	assert.equal(result?.url, "https://checkout.example/app");
});

test("app credit balance and checkout verification call Eliza Cloud app-credit APIs", async () => {
	const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
		assert.equal(init?.method, "GET");
		if (String(url) === "https://cloud.test/api/v1/app-credits/balance?app_id=cloud-app-01") {
			return Response.json({
				success: true,
				balance: 4.5,
				totalPurchased: 5,
				totalSpent: 0.5,
				isLow: true,
			});
		}
		assert.equal(String(url), "https://cloud.test/api/v1/app-credits/verify?session_id=cs_app");
		return Response.json({
			success: true,
			amount: 5,
			message: "Credits added successfully",
		});
	});

	const client = createElizaCloudClient({
		baseUrl: "https://cloud.test",
		apiKey: "key_123",
		logger: {},
	});
	const balance = await client.getAppCreditBalance?.("cloud-app-01");
	const verified = await client.verifyAppCreditCheckout?.("cs_app");

	assert.equal(fetchMock.mock.callCount(), 2);
	assert.deepEqual(balance, {
		success: true,
		balance: 4.5,
		totalPurchased: 5,
		totalSpent: 0.5,
		isLow: true,
	});
	assert.deepEqual(verified, {
		success: true,
		amount: 5,
		message: "Credits added successfully",
	});
});
