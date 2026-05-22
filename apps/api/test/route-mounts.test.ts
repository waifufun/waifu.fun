import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/app.js";
import type { AppConfig, AppDependencies, DbClient, FlapClient } from "../src/contracts/services.js";
import { createMemoryRateLimitStore } from "../src/middleware/rate-limit.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SAMPLE_ID = "route-smoke";

function config(): AppConfig {
	return {
		app: {
			name: "@waifufun/api-route-smoke",
			env: "test",
			host: "127.0.0.1",
			port: 0,
			corsOrigins: ["https://www.waifu.fun"],
		},
		auth: {
			accessTokenTtlSeconds: 900,
			refreshTokenTtlSeconds: 86_400,
		},
		chain: {
			chainId: 56,
			rpcUrl: "https://bsc.example/rpc",
			portalAddress: ZERO_ADDRESS,
			nativeQuoteTokenSymbol: "BNB",
		},
		flap: {
			uploadApiUrl: "https://flap.example/upload",
			metadataGatewayBaseUrl: "https://flap.example/ipfs",
		},
		features: {
			curatedLaunchOnly: false,
		},
		steward: {
			jwtSecret: "test-secret",
			apiUrl: "https://steward.example",
			tenantId: "waifu",
			tenantApiKey: "tenant-key",
		},
	};
}

function db(): DbClient {
	return {
		ping: async () => true,
		health: async () => ({ ok: true, provider: "stub-db" }),
		listTokens: async () => ({ items: [], page: 1, limit: 30, total: 0 }),
		getTokenByAddress: async () => null,
		listTokenTrades: async () => [],
		createLaunch: async () => {
			throw new Error("createLaunch should not be reached by route mount tests");
		},
		getLaunchById: async () => null,
		listAdminLaunches: async () => [],
		updateLaunchStatus: async () => null,
		getCreatorProfile: async (address) => ({
			address,
			displayName: "Route Smoke",
			bio: "",
			avatarUrl: null,
			twitter: null,
			website: null,
			createdAt: new Date(0).toISOString(),
			updatedAt: new Date(0).toISOString(),
		}),
		updateCreatorProfile: async (address, input) => ({
			address,
			displayName: input.displayName ?? "Route Smoke",
			bio: input.bio ?? "",
			avatarUrl: input.avatarUrl ?? null,
			twitter: input.twitter ?? null,
			website: input.website ?? null,
			createdAt: new Date(0).toISOString(),
			updatedAt: new Date(0).toISOString(),
		}),
		validateInviteCode: async () => ({ valid: false, reason: "not_found" }),
		createInviteCode: async (input) => ({
			code: input.code,
			maxUses: input.maxUses,
			uses: 0,
			expiresAt: input.expiresAt ?? null,
			createdAt: new Date(0).toISOString(),
		}),
		listInviteCodes: async () => [],
		getTokenChartData: async () => [],
		linkAgentToToken: async () => {},
	};
}

function flap(): FlapClient {
	return {
		ping: async () => true,
		health: async () => ({ ok: true, provider: "stub-flap" }),
		prepareLaunchPayload: async () => {
			throw new Error("prepareLaunchPayload should not be reached by route mount tests");
		},
		quoteExactInput: async (input) => ({
			tokenAddress: input.tokenAddress,
			side: input.side,
			inputAmount: input.amount,
			outputAmount: "0",
			quoteToken: "BNB",
			estimatedFeeBps: 0,
			slippageBps: input.slippageBps,
			source: "route-smoke",
			expiresAt: new Date(Date.now() + 30_000).toISOString(),
		}),
		prepareSwap: async (input) => ({
			traderAddress: input.traderAddress,
			quote: {
				tokenAddress: input.tokenAddress,
				side: input.side,
				inputAmount: input.amount,
				outputAmount: "0",
				quoteToken: "BNB",
				estimatedFeeBps: 0,
				slippageBps: input.slippageBps,
				source: "route-smoke",
				expiresAt: new Date(Date.now() + 30_000).toISOString(),
			},
			call: {
				contractAddress: ZERO_ADDRESS,
				method: "swapExactInput",
				calldata: "0x",
				value: "0",
			},
			notes: [],
		}),
	};
}

function deps(): AppDependencies {
	return {
		config: config(),
		db: db(),
		flap: flap(),
		runtime: {
			startedAt: new Date(0).toISOString(),
			compatibilityMode: "real-db",
			notes: [],
		},
	};
}

const ROUTES = [
	{ method: "GET", path: "/" },
	{ method: "GET", path: "/health" },
	{ method: "GET", path: "/health/ready" },
	{ method: "GET", path: "/metrics" },
	{ method: "GET", path: "/openapi.json" },
	{ method: "GET", path: "/AGENT.md" },
	{ method: "GET", path: `/tokens/${ZERO_ADDRESS}` },
	{ method: "GET", path: "/tokens?limit=1&page=1" },
	{ method: "POST", path: "/tokens/trades", body: { chain: "bsc", chainId: 56, contractAddress: ZERO_ADDRESS } },
	{ method: "POST", path: "/trades/quote", body: { tokenAddress: ZERO_ADDRESS, side: "buy", amount: "1" } },
	{ method: "POST", path: "/trades/prepare-swap", body: { tokenAddress: ZERO_ADDRESS, side: "buy", amount: "1" } },
	{ method: "GET", path: `/creators/${ZERO_ADDRESS}` },
	{ method: "GET", path: `/launches/${SAMPLE_ID}` },
	{ method: "GET", path: "/admin/launches" },
	{ method: "GET", path: "/admin/invites" },
	{ method: "GET", path: "/admin/runtime" },
	{ method: "GET", path: `/agents/${ZERO_ADDRESS}` },
	{ method: "GET", path: `/jobs/${SAMPLE_ID}` },
	{ method: "GET", path: "/v2/launches" },
	{ method: "GET", path: `/v2/launches/${SAMPLE_ID}` },
	{ method: "GET", path: "/v2/agents" },
	{ method: "GET", path: `/v2/agents/${ZERO_ADDRESS}` },
	{ method: "GET", path: "/v2/adapters/templates" },
	{ method: "GET", path: `/v2/agents/${ZERO_ADDRESS}/blink` },
	{ method: "POST", path: "/v2/auth/siwe/nonce", body: { address: ZERO_ADDRESS, chainId: 56 } },
	{ method: "GET", path: "/v3/launchpads" },
	{ method: "POST", path: "/v3/agents", body: { name: "Route Smoke", chain: "bsc" } },
	{ method: "GET", path: "/v3/patron/me" },
] as const;

test("app route table mounts every public API family used by the frontend", async () => {
	const app = createApp(deps(), undefined, { rateLimitStore: createMemoryRateLimitStore() });

	for (const route of ROUTES) {
		const response = await app.request(`http://api.test${route.path}`, {
			method: route.method,
			headers: route.body ? { "Content-Type": "application/json" } : undefined,
			body: route.body ? JSON.stringify(route.body) : undefined,
		});

		if (response.status === 404) {
			const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
			assert.notEqual(body?.error?.code, "NOT_FOUND", `${route.method} ${route.path} fell through to global 404`);
		}
		assert.ok(
			response.status >= 200 && response.status < 600,
			`${route.method} ${route.path} returned ${response.status}`,
		);
	}
});

test("app mounts bounded rate limits on sensitive API families", async () => {
	const app = createApp(deps(), undefined, { rateLimitStore: createMemoryRateLimitStore() });
	const routes = [
		{ method: "POST", path: "/auth/refresh", bucket: "auth", body: {} },
		{ method: "POST", path: "/auth/oauth/finalize", bucket: "auth", body: {} },
		{ method: "POST", path: "/auth/email/finalize", bucket: "auth", body: {} },
		{ method: "POST", path: "/auth/passkey/finalize", bucket: "auth", body: {} },
		{ method: "POST", path: "/v2/auth/siwe/nonce", bucket: "auth", body: {} },
		{ method: "GET", path: "/v2/launches", bucket: "launch" },
		{ method: "POST", path: "/v2/agents/prepare", bucket: "launch", body: {} },
		{ method: "PATCH", path: `/v2/agents/claim/${ZERO_ADDRESS}`, bucket: "launch", body: {} },
		{ method: "POST", path: `/v2/agents/claim/${ZERO_ADDRESS}/launch`, bucket: "launch", body: {} },
		{ method: "GET", path: "/v2/admin/agents/demo/state", bucket: "admin" },
		{ method: "POST", path: "/v2/webhooks/agent-events", bucket: "webhook", body: {} },
		{ method: "POST", path: "/v3/agents/demo/launch", bucket: "v3-agent", body: {} },
	] as const;

	for (const route of routes) {
		const response = await app.request(`http://api.test${route.path}`, {
			method: route.method,
			headers: route.body ? { "Content-Type": "application/json" } : undefined,
			body: route.body ? JSON.stringify(route.body) : undefined,
		});

		assert.match(
			response.headers.get("X-RateLimit-Policy") ?? "",
			new RegExp(`^${route.bucket}; limit=\\d+; window=\\d+`),
			`${route.method} ${route.path} is missing ${route.bucket} rate limit headers`,
		);
	}
});
