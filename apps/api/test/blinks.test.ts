import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { AppConfig, AppDependencies, FlapClient } from "../src/contracts/services.js";
import type { AppBindings } from "../src/lib/bindings.js";
import { type BlinkAgentSnapshot, createBlinkRoutes } from "../src/routes/v2/blinks.js";

const TOKEN_ADDR = "0x1234567890abcdef1234567890abcdef12345678";
const TRADER_ADDR = "0x00000000000000000000000000000000000000aa";
const PORTAL_ADDR = "0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0";
const PORTAL_CALLDATA = "0xdeadbeef";

const baseSnapshot: BlinkAgentSnapshot = {
	name: "Eliza",
	symbol: "ELIZA",
	avatarUrl: "https://cdn.example.com/eliza.png",
	status: "active",
	curveProgressPercent: 42,
};

function buildFlapStub(
	overrides: {
		quote?: Partial<Awaited<ReturnType<FlapClient["quoteExactInput"]>>>;
		prepare?: Partial<Awaited<ReturnType<FlapClient["prepareSwap"]>>>;
		quoteThrows?: Error;
		prepareThrows?: Error;
	} = {},
): FlapClient {
	return {
		ping: async () => true,
		health: async () => ({ ok: true, provider: "stub" }),
		prepareLaunchPayload: async () => {
			throw new Error("not implemented in stub");
		},
		quoteExactInput: async (input) => {
			if (overrides.quoteThrows) throw overrides.quoteThrows;
			return {
				tokenAddress: input.tokenAddress,
				side: input.side,
				inputAmount: input.amount,
				outputAmount: "12345.6789",
				quoteToken: "BNB",
				estimatedFeeBps: 100,
				slippageBps: input.slippageBps,
				source: "real-flap-rpc",
				expiresAt: new Date(Date.now() + 30_000).toISOString(),
				...overrides.quote,
			};
		},
		prepareSwap: async (input) => {
			if (overrides.prepareThrows) throw overrides.prepareThrows;
			return {
				traderAddress: input.traderAddress,
				quote: {
					tokenAddress: input.tokenAddress,
					side: input.side,
					inputAmount: input.amount,
					outputAmount: "12345.6789",
					quoteToken: "BNB",
					estimatedFeeBps: 100,
					slippageBps: input.slippageBps,
					source: "real-flap-rpc",
					expiresAt: new Date(Date.now() + 30_000).toISOString(),
				},
				call: {
					contractAddress: PORTAL_ADDR,
					method: "swapExactInput",
					calldata: PORTAL_CALLDATA,
					permitData: "0x",
					value: "100000000000000000",
				},
				notes: ["stub"],
				...overrides.prepare,
			};
		},
	};
}

function stubAppConfig(): AppConfig {
	return {
		app: {
			name: "@waifufun/api-test",
			env: "test",
			host: "localhost",
			port: 0,
			corsOrigins: ["https://www.waifu.fun"],
		},
		auth: {
			accessTokenTtlSeconds: 900,
			refreshTokenTtlSeconds: 86_400,
		},
		chain: {
			chainId: 56,
			rpcUrl: "https://bsc.example/test",
			portalAddress: PORTAL_ADDR,
			nativeQuoteTokenSymbol: "BNB",
		},
		flap: {
			uploadApiUrl: "https://flap.example/api/upload",
			metadataGatewayBaseUrl: "https://flap.example/ipfs",
		},
		features: {
			curatedLaunchOnly: false,
		},
		steward: {
			jwtSecret: "test-secret",
			apiUrl: "https://steward.example",
			tenantId: "waifu",
			tenantApiKey: "test-tenant-key",
		},
	};
}

function buildStubDeps(flap: FlapClient): AppDependencies {
	return {
		config: stubAppConfig(),
		db: {} as AppDependencies["db"],
		flap,
		runtime: {
			startedAt: new Date(0).toISOString(),
			compatibilityMode: "real-db",
			notes: [],
		},
	};
}

/**
 * Wrap the blink router with a no-op deps middleware so handlers that read
 * `c.get("deps").config.chain.chainId` resolve in tests. Mirrors the real
 * `attachRequestContext` behavior just enough for the route under test.
 */
function mountWithDeps(blinkApp: Hono<AppBindings>, deps: AppDependencies): Hono<AppBindings> {
	const app = new Hono<AppBindings>();
	app.use("*", async (c, next) => {
		c.set("deps", deps);
		await next();
	});
	app.route("/", blinkApp);
	return app;
}

// --- Layer A: route-level GET --------------------------------------------------

test("GET /:tokenAddress/blink returns dial.to-shape JSON for active agents", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({
		flap,
		getAgent: async () => baseSnapshot,
	});
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink`);
	assert.equal(res.status, 200);

	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.type, "action");
	assert.equal(body.icon, baseSnapshot.avatarUrl);
	assert.equal(body.title, "Buy $ELIZA");
	assert.equal(body.label, "Buy $ELIZA");
	assert.match(String(body.description), /Eliza/);
	assert.match(String(body.description), /flap\.sh/);

	const links = body.links as { actions: Array<{ label: string; href: string; parameters?: unknown }> };
	assert.equal(links.actions.length, 5);
	assert.equal(links.actions[0]?.label, "0.05 BNB");
	assert.match(links.actions[0]?.href ?? "", /amount=0\.05$/);
	const customAction = links.actions[4];
	assert.ok(customAction);
	assert.match(customAction.href, /amount=\{amount\}$/);
	assert.ok(Array.isArray(customAction.parameters));

	assert.equal(res.headers.get("Cache-Control"), "public, max-age=60");
});

test("GET /:tokenAddress/blink renders without preview when flap quote fails", async () => {
	const flap = buildFlapStub({ quoteThrows: new Error("rpc down") });
	const blinkApp = createBlinkRoutes({
		flap,
		getAgent: async () => baseSnapshot,
	});
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink`);
	assert.equal(res.status, 200);
	const body = (await res.json()) as { description: string };
	assert.match(body.description, /Eliza/);
	assert.doesNotMatch(body.description, /per 0\.1 BNB/);
});

test("GET /:tokenAddress/blink uses tighter cache when curve is near graduation", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({
		flap,
		getAgent: async () => ({ ...baseSnapshot, curveProgressPercent: 92 }),
	});
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink`);
	assert.equal(res.status, 200);
	assert.equal(res.headers.get("Cache-Control"), "public, max-age=10");
});

test("GET /:tokenAddress/blink falls back to default icon when avatarUrl is missing", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({
		flap,
		getAgent: async () => ({ ...baseSnapshot, avatarUrl: null }),
	});
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink`);
	assert.equal(res.status, 200);
	const body = (await res.json()) as { icon: string };
	assert.match(body.icon, /^https:\/\/waifu\.fun\//);
});

test("GET /:tokenAddress/blink rejects malformed token address", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({ flap, getAgent: async () => baseSnapshot });
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request("http://api.test.local/not-an-address/blink");
	assert.equal(res.status, 400);
});

test("GET /:tokenAddress/blink returns 404 when the agent is unknown", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({ flap, getAgent: async () => null });
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink`);
	assert.equal(res.status, 404);
});

test("GET /:tokenAddress/blink returns 404 when agent status is not tradable", async () => {
	const flap = buildFlapStub();
	for (const status of ["failed", "pending"]) {
		const blinkApp = createBlinkRoutes({
			flap,
			getAgent: async () => ({ ...baseSnapshot, status }),
		});
		const app = mountWithDeps(blinkApp, buildStubDeps(flap));
		const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink`);
		assert.equal(res.status, 404, `expected 404 for status=${status}`);
	}
});

// --- Layer A: route-level POST -------------------------------------------------

test("POST /:tokenAddress/blink returns dial.to-shape transaction object", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({
		flap,
		getAgent: async () => baseSnapshot,
	});
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink?amount=0.1`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ account: TRADER_ADDR }),
	});

	assert.equal(res.status, 200);
	assert.equal(res.headers.get("Cache-Control"), "no-store");

	const body = (await res.json()) as {
		type: string;
		transaction: { to: string; data: string; value: string; chainId: number };
		message: string;
	};
	assert.equal(body.type, "transaction");
	assert.equal(body.transaction.to, PORTAL_ADDR);
	assert.equal(body.transaction.data, PORTAL_CALLDATA);
	assert.equal(body.transaction.value, "100000000000000000");
	assert.equal(body.transaction.chainId, 56);
	assert.match(body.message, /ELIZA/);
	assert.match(body.message, /0\.1 BNB$/);
});

test("POST /:tokenAddress/blink rejects invalid token address", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({ flap, getAgent: async () => baseSnapshot });
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request("http://api.test.local/not-an-address/blink?amount=0.1", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ account: TRADER_ADDR }),
	});
	assert.equal(res.status, 400);
	assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("POST /:tokenAddress/blink rejects missing/invalid amount query", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({ flap, getAgent: async () => baseSnapshot });
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	for (const q of ["", "?amount=", "?amount=abc", "?amount=-1", "?amount=0", "?amount=200"]) {
		const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink${q}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ account: TRADER_ADDR }),
		});
		assert.equal(res.status, 400, `expected 400 for query "${q}"`);
	}
});

test("POST /:tokenAddress/blink rejects missing or malformed account", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({ flap, getAgent: async () => baseSnapshot });
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const cases: Array<{ body: string; label: string }> = [
		{ body: "{", label: "invalid JSON" },
		{ body: JSON.stringify({}), label: "missing account" },
		{ body: JSON.stringify({ account: "not-an-address" }), label: "malformed account" },
		{ body: JSON.stringify({ account: 123 }), label: "non-string account" },
	];

	for (const c of cases) {
		const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink?amount=0.1`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: c.body,
		});
		assert.equal(res.status, 400, `expected 400 for ${c.label}`);
	}
});

test("POST /:tokenAddress/blink returns 502 when flap.prepareSwap throws", async () => {
	const flap = buildFlapStub({ prepareThrows: new Error("portal reverted") });
	const blinkApp = createBlinkRoutes({
		flap,
		getAgent: async () => baseSnapshot,
	});
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink?amount=0.1`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ account: TRADER_ADDR }),
	});
	assert.equal(res.status, 502);
	assert.equal(res.headers.get("Cache-Control"), "no-store");
	const body = (await res.json()) as { error: string; detail: string };
	assert.equal(body.error, "failed to prepare swap");
	assert.match(body.detail, /portal reverted/);
});

// --- Layer B: route-level CORS preflight ---------------------------------------
//
// The load-bearing app.ts mount (cors before the global cors) is verified
// manually per the PR test plan. This test covers the defensive route-level
// cors mount inside `createBlinkRoutes`, which guarantees Blink discovery
// stays reachable from any origin even if the app-level ordering is changed.

test("OPTIONS /:tokenAddress/blink returns wildcard ACAO from any origin", async () => {
	const flap = buildFlapStub();
	const blinkApp = createBlinkRoutes({ flap, getAgent: async () => baseSnapshot });
	const app = mountWithDeps(blinkApp, buildStubDeps(flap));

	const res = await app.request(`http://api.test.local/${TOKEN_ADDR}/blink`, {
		method: "OPTIONS",
		headers: {
			Origin: "https://random-renderer.example",
			"Access-Control-Request-Method": "POST",
			"Access-Control-Request-Headers": "content-type",
		},
	});

	assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
	const allowMethods = res.headers.get("Access-Control-Allow-Methods") ?? "";
	assert.match(allowMethods, /POST/);
	assert.match(allowMethods, /GET/);
});
