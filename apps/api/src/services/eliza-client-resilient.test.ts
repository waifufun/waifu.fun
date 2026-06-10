import assert from "node:assert/strict";
import test from "node:test";

import { CircuitBreaker, ElizaCloudUnavailableError } from "@waifufun/resilience";

import {
	__resetElizaResilienceBreakersForTest,
	__resilienceMethodSets,
	wrapElizaClientWithResilience,
} from "./eliza-client-resilient.js";
import { ElizaApiError, ElizaClient } from "./eliza-client.js";

/**
 * Build a stub ElizaClient where each method is a counter-backed fn we can script
 * to fail a set number of times. We only stub the methods under test; the Proxy
 * delegates by name so the stub doesn't need the full class surface.
 */
function makeStub(overrides: Partial<Record<keyof ElizaClient, (...args: unknown[]) => Promise<unknown>>>): {
	client: ElizaClient;
	calls: Record<string, number>;
} {
	const calls: Record<string, number> = {};
	const handler: ProxyHandler<object> = {
		get(_t, prop) {
			if (typeof prop !== "string") return undefined;
			const override = overrides[prop as keyof ElizaClient];
			return (...args: unknown[]) => {
				calls[prop] = (calls[prop] ?? 0) + 1;
				if (override) return override(...args);
				return Promise.resolve({ ok: true });
			};
		},
	};
	return { client: new Proxy({}, handler) as ElizaClient, calls };
}

/** A breaker with an injected clock so we can drive half-open transitions deterministically. */
function fastBreaker(
	now: () => number,
	opts?: { failureThreshold?: number; successThreshold?: number; halfOpenAfterMs?: number },
) {
	return new CircuitBreaker({
		name: "test",
		failureThreshold: opts?.failureThreshold ?? 5,
		successThreshold: opts?.successThreshold ?? 2,
		halfOpenAfterMs: opts?.halfOpenAfterMs ?? 30_000,
		now,
	});
}

const noWait = { retry: { baseDelayMs: 0, maxDelayMs: 0 } } as const;

test("retryable GET retries on 5xx then succeeds", async () => {
	__resetElizaResilienceBreakersForTest();
	let attempts = 0;
	const { client } = makeStub({
		getCreditBalance: () => {
			attempts += 1;
			if (attempts < 3) return Promise.reject(new ElizaApiError(503, "boom"));
			return Promise.resolve({ balance: 42, isLow: false });
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", noWait);

	const result = await wrapped.getCreditBalance("agent-1");
	assert.deepEqual(result, { balance: 42, isLow: false });
	assert.equal(attempts, 3, "should have retried twice before the 3rd succeeded");
});

test("retryable GET does NOT retry on 4xx (404)", async () => {
	__resetElizaResilienceBreakersForTest();
	let attempts = 0;
	const { client } = makeStub({
		getCreditBalance: () => {
			attempts += 1;
			return Promise.reject(new ElizaApiError(404, "not found"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", noWait);

	await assert.rejects(
		() => wrapped.getCreditBalance("agent-1"),
		(err: unknown) => err instanceof ElizaApiError && err.status === 404,
	);
	assert.equal(attempts, 1, "4xx must not be retried");
});

test("mutation does NOT retry on 5xx (single attempt only)", async () => {
	__resetElizaResilienceBreakersForTest();
	let attempts = 0;
	const { client } = makeStub({
		sendAgentMessage: () => {
			attempts += 1;
			return Promise.reject(new ElizaApiError(503, "boom"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", noWait);

	await assert.rejects(
		() => wrapped.sendAgentMessage({ agentId: "a", text: "hi", sessionId: "s" }),
		(err: unknown) => err instanceof ElizaApiError && err.status === 503,
	);
	assert.equal(attempts, 1, "mutations get exactly one attempt even on 5xx");
});

test("provisioning 409 propagates unshaped (worker adoption path)", async () => {
	__resetElizaResilienceBreakersForTest();
	let attempts = 0;
	const { client } = makeStub({
		provisionWaifuAgent: () => {
			attempts += 1;
			return Promise.reject(new ElizaApiError(409, "already exists"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", noWait);

	await assert.rejects(
		() => wrapped.provisionWaifuAgent({} as unknown as Parameters<ElizaClient["provisionWaifuAgent"]>[0]),
		(err: unknown) => {
			assert.ok(err instanceof ElizaApiError, "must stay an ElizaApiError, not ElizaCloudUnavailableError");
			assert.equal(err.status, 409, "409 must be preserved verbatim");
			return true;
		},
	);
	assert.equal(attempts, 1, "409 must not be retried");
});

test("breaker does NOT count repeated 409 mutations as failures (shared breaker stays closed)", async () => {
	__resetElizaResilienceBreakersForTest();
	const clock = 0;
	const breaker = fastBreaker(() => clock, { failureThreshold: 3 });
	let upstreamCalls = 0;
	const { client } = makeStub({
		provisionWaifuAgent: () => {
			upstreamCalls += 1;
			return Promise.reject(new ElizaApiError(409, "already exists"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", { breaker, retry: { maxAttempts: 1 } });

	// failureThreshold is 3. Fire 4 conflicting mutations; none must trip the breaker.
	for (let i = 0; i < 4; i += 1) {
		await assert.rejects(
			() => wrapped.provisionWaifuAgent({} as unknown as Parameters<ElizaClient["provisionWaifuAgent"]>[0]),
			(err: unknown) => err instanceof ElizaApiError && err.status === 409,
		);
	}
	// Every call reached upstream — the circuit never opened to fast-fail any of them.
	assert.equal(upstreamCalls, 4, "all 4 calls must reach upstream; 409s must not open the shared breaker");
	assert.equal(breaker.getState(), "closed", "circuit must stay closed after repeated 409s");
});

test("breaker does NOT count repeated 429 mutations as failures", async () => {
	__resetElizaResilienceBreakersForTest();
	const clock = 0;
	const breaker = fastBreaker(() => clock, { failureThreshold: 3 });
	let upstreamCalls = 0;
	const { client } = makeStub({
		sendAgentMessage: () => {
			upstreamCalls += 1;
			return Promise.reject(new ElizaApiError(429, "rate limited"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", { breaker, retry: { maxAttempts: 1 } });

	for (let i = 0; i < 4; i += 1) {
		await assert.rejects(
			() => wrapped.sendAgentMessage({ agentId: "a", text: "hi", sessionId: "s" }),
			(err: unknown) => err instanceof ElizaApiError && err.status === 429,
		);
	}
	assert.equal(upstreamCalls, 4, "all 4 calls must reach upstream; 429s must not open the breaker");
	assert.equal(breaker.getState(), "closed", "circuit must stay closed after repeated 429s");
});

test("breaker DOES count 5xx mutations and opens at the failure threshold", async () => {
	__resetElizaResilienceBreakersForTest();
	const clock = 0;
	const breaker = fastBreaker(() => clock, { failureThreshold: 3 });
	let upstreamCalls = 0;
	const { client } = makeStub({
		sendAgentMessage: () => {
			upstreamCalls += 1;
			return Promise.reject(new ElizaApiError(503, "down"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", { breaker, retry: { maxAttempts: 1 } });

	// 3 consecutive 5xx mutations trip the breaker (mutations are not retried → 1 hit each).
	for (let i = 0; i < 3; i += 1) {
		await assert.rejects(
			() => wrapped.sendAgentMessage({ agentId: "a", text: "hi", sessionId: "s" }),
			(err: unknown) => err instanceof ElizaApiError && err.status === 503,
		);
	}
	assert.equal(upstreamCalls, 3, "3 upstream 5xx failures before the circuit opens");
	assert.equal(breaker.getState(), "open", "circuit must open after threshold consecutive 5xx");

	// 4th call: circuit open → ElizaCloudUnavailableError, upstream NOT touched.
	await assert.rejects(
		() => wrapped.sendAgentMessage({ agentId: "a", text: "hi", sessionId: "s" }),
		(err: unknown) => err instanceof ElizaCloudUnavailableError,
	);
	assert.equal(upstreamCalls, 3, "open circuit must not call upstream");
});

test("breaker DOES count a raw network error (no status) and opens", async () => {
	__resetElizaResilienceBreakersForTest();
	const clock = 0;
	const breaker = fastBreaker(() => clock, { failureThreshold: 2 });
	let upstreamCalls = 0;
	const { client } = makeStub({
		sendAgentMessage: () => {
			upstreamCalls += 1;
			// A bare fetch failure (ECONNREFUSED etc.) has no numeric status — it is the
			// upstream-down signal the breaker MUST trip on (unlike isRetryableElizaError,
			// which fails closed and would not retry it).
			return Promise.reject(new Error("ECONNREFUSED"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", { breaker, retry: { maxAttempts: 1 } });

	for (let i = 0; i < 2; i += 1) {
		await assert.rejects(
			() => wrapped.sendAgentMessage({ agentId: "a", text: "hi", sessionId: "s" }),
			(err: unknown) => err instanceof Error && err.message === "ECONNREFUSED",
		);
	}
	assert.equal(breaker.getState(), "open", "network errors must count and open the circuit");
});

test("breaker does NOT count 404 on a retryable GET (after retries exhaust, circuit stays closed)", async () => {
	__resetElizaResilienceBreakersForTest();
	const clock = 0;
	const breaker = fastBreaker(() => clock, { failureThreshold: 3 });
	let upstreamCalls = 0;
	const { client } = makeStub({
		getCreditBalance: () => {
			upstreamCalls += 1;
			return Promise.reject(new ElizaApiError(404, "not found"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", { breaker, ...noWait });

	for (let i = 0; i < 4; i += 1) {
		await assert.rejects(
			() => wrapped.getCreditBalance("agent-1"),
			(err: unknown) => err instanceof ElizaApiError && err.status === 404,
		);
	}
	assert.equal(upstreamCalls, 4, "404 GETs are not retried (1 hit each) and must reach upstream every time");
	assert.equal(breaker.getState(), "closed", "4xx on a GET must not open the breaker either");
});

test("open circuit throws ElizaCloudUnavailableError WITHOUT calling upstream", async () => {
	__resetElizaResilienceBreakersForTest();
	const clock = 0;
	const breaker = fastBreaker(() => clock, { failureThreshold: 3 });
	let upstreamCalls = 0;
	const { client } = makeStub({
		getAvailability: () => {
			upstreamCalls += 1;
			return Promise.reject(new ElizaApiError(503, "down"));
		},
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", { breaker, retry: { maxAttempts: 1 } });

	// 3 consecutive failures trip the breaker (maxAttempts:1 so each call = 1 upstream hit).
	for (let i = 0; i < 3; i += 1) {
		await assert.rejects(() => wrapped.getAvailability());
	}
	assert.equal(upstreamCalls, 3, "breaker should open after 3 upstream failures");

	// Next call: circuit open → ElizaCloudUnavailableError, no upstream call.
	await assert.rejects(
		() => wrapped.getAvailability(),
		(err: unknown) =>
			err instanceof ElizaCloudUnavailableError && err.httpStatus === 503 && err.code === "ELIZA_CLOUD_UNAVAILABLE",
	);
	assert.equal(upstreamCalls, 3, "open circuit must NOT call upstream");
});

test("open circuit recovers via half-open probe after delay", async () => {
	__resetElizaResilienceBreakersForTest();
	let clock = 0;
	const breaker = fastBreaker(() => clock, { failureThreshold: 2, successThreshold: 1, halfOpenAfterMs: 1_000 });
	let healthy = false;
	const { client } = makeStub({
		getAvailability: () => (healthy ? Promise.resolve({ ok: true }) : Promise.reject(new ElizaApiError(503, "down"))),
	});
	const wrapped = wrapElizaClientWithResilience(client, "test", { breaker, retry: { maxAttempts: 1 } });

	await assert.rejects(() => wrapped.getAvailability());
	await assert.rejects(() => wrapped.getAvailability()); // 2nd failure → open
	await assert.rejects(
		() => wrapped.getAvailability(),
		(e: unknown) => e instanceof ElizaCloudUnavailableError,
	);

	// Advance past the half-open delay; upstream is healthy now → probe closes circuit.
	clock += 1_001;
	healthy = true;
	const result = await wrapped.getAvailability();
	assert.deepEqual(result, { ok: true });
});

test("passthrough method (hasCryptoSession) is not circuit-wrapped", async () => {
	__resetElizaResilienceBreakersForTest();
	const { client } = makeStub({ hasCryptoSession: () => Promise.resolve(true) });
	const wrapped = wrapElizaClientWithResilience(client, "test", noWait);
	// hasCryptoSession is synchronous on the real client; our stub returns a promise,
	// but the wrapper must call it directly (bound) without breaker/retry wrapping.
	const value = await (wrapped.hasCryptoSession as unknown as () => Promise<boolean>)();
	assert.equal(value, true);
});

test("method classification sets are disjoint", () => {
	const { retryableGet, mutation, passthrough } = __resilienceMethodSets;
	for (const m of retryableGet) {
		assert.ok(!mutation.has(m), `${String(m)} is in both retryableGet and mutation`);
		assert.ok(!passthrough.has(m), `${String(m)} is in both retryableGet and passthrough`);
	}
	for (const m of mutation) {
		assert.ok(!passthrough.has(m), `${String(m)} is in both mutation and passthrough`);
	}
});

/**
 * Private ElizaClient helpers live on the prototype too (TS `private` is erased at
 * runtime), so they must be excluded from the public-method enumeration. If a new
 * PRIVATE helper is added it goes here; a new PUBLIC method does NOT — it must be
 * classified into one of the three whitelists or this test fails (which is the point).
 */
const PRIVATE_ELIZA_CLIENT_METHODS = new Set([
	"constructor",
	"resolvePlatformSessionToken",
	"getServiceToken",
	"request",
	"normalizePath",
	"generateUserToken",
]);

test("every public ElizaClient method is classified into exactly one set", () => {
	const { retryableGet, mutation, passthrough } = __resilienceMethodSets;
	const publicMethods = Object.getOwnPropertyNames(ElizaClient.prototype).filter((name) => {
		if (PRIVATE_ELIZA_CLIENT_METHODS.has(name)) return false;
		const descriptor = Object.getOwnPropertyDescriptor(ElizaClient.prototype, name);
		return typeof descriptor?.value === "function";
	});

	assert.ok(publicMethods.length > 0, "expected to enumerate ElizaClient prototype methods");

	const unclassified: string[] = [];
	for (const name of publicMethods) {
		const key = name as keyof ElizaClient;
		const memberships = [retryableGet.has(key), mutation.has(key), passthrough.has(key)].filter(Boolean).length;
		if (memberships !== 1) {
			unclassified.push(`${name} (in ${memberships} sets, expected exactly 1)`);
		}
	}
	assert.deepEqual(
		unclassified,
		[],
		`unclassified or multiply-classified ElizaClient methods — add each to exactly one whitelist in eliza-client-resilient.ts: ${unclassified.join(", ")}`,
	);

	// And the reverse: no whitelist names a method that no longer exists on the client
	// (guards a rename leaving a dangling whitelist entry that would silently never match).
	const allKnown = new Set<string>(publicMethods);
	for (const set of [retryableGet, mutation, passthrough]) {
		for (const key of set) {
			assert.ok(
				allKnown.has(String(key)),
				`whitelist names "${String(key)}" but it is not a public ElizaClient method`,
			);
		}
	}
});
