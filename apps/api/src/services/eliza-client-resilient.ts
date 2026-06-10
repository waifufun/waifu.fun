/**
 * Resilience decorator over {@link ElizaClient}.
 *
 * Eliza Cloud calls used to go out raw: a 20s timeout, zero retries, no circuit
 * breaker, and 502/504s surfaced verbatim to patrons. This wrapper sits in front
 * of every public ElizaClient method and:
 *
 *   - Idempotent GETs (status, balances, availability, logs) → circuit breaker
 *     PLUS bounded retry on transient 5xx/timeout (never 4xx, never 409/429).
 *   - Mutations (provisioning, credits, lifecycle, chat) → circuit breaker ONLY.
 *     POSTs are not idempotent — retrying a provisioning POST would duplicate a
 *     container or confuse the worker's 409-adoption path, so they get exactly
 *     one attempt per call.
 *
 * When the breaker is open the wrapper translates the package-level
 * {@link CircuitOpenError} into an {@link ElizaCloudUnavailableError} (HTTP 503 +
 * machine-readable code) so consuming routes catch a single terminal type. Every
 * OTHER error — including `ElizaApiError` 409 (worker adoption depends on it) and
 * raw 5xx that haven't tripped the breaker yet — propagates UNSHAPED.
 *
 * The retryable-vs-mutation split is an EXPLICIT whitelist of method names, not
 * inferred from an HTTP verb at runtime. A future contributor who adds retry to a
 * POST has to edit this whitelist on purpose; a regression test guards it.
 */

import {
	CIRCUIT_STATE_CODE,
	CircuitBreaker,
	CircuitOpenError,
	type CircuitState,
	ElizaCloudUnavailableError,
	isRetryableElizaError,
	withRetry,
} from "@waifufun/resilience";

import type { ElizaClient } from "./eliza-client.js";

/**
 * The set of public ElizaClient methods that are idempotent reads and therefore
 * safe to retry. Anything NOT in this set is treated as a mutation (breaker only).
 *
 * Note the two "verify" sibling methods are classified by their underlying HTTP
 * verb, not their name: `verifyAppCreditCheckout` is a GET (retryable);
 * `verifyCreditCheckout` is a POST (mutation, NOT retried).
 */
const RETRYABLE_GET_METHODS = new Set<keyof ElizaClient>([
	"getAvailability",
	"getContainer",
	"getAgentRuntimeStatus",
	"getAgents",
	"getAgent",
	"getJobStatus",
	"getCryptoStatus",
	"getAppCreditBalance",
	"getCreditBalance",
	"verifyAppCreditCheckout",
	"getAgentLogs",
]);

/**
 * Mutating / non-idempotent methods: circuit breaker only, NEVER retried. Listed
 * explicitly (rather than "everything not a GET") so the classification of every
 * networked method is auditable in one place and the regression test can assert
 * the two sets are disjoint and exhaustive.
 */
const MUTATION_METHODS = new Set<keyof ElizaClient>([
	"createAgent",
	"provisionAgent",
	"provisionWaifuAgent",
	"provisionAgentWallet",
	"createContainer",
	"deleteAgent",
	"restartAgent",
	"pauseAgent",
	"resumeAgent",
	"restartHostedAgent",
	"deprovisionAgent",
	"topUpCredits",
	"topUpAppCredits",
	"createCryptoPayment",
	"confirmCryptoPayment",
	"verifyCreditCheckout",
	"sendAgentMessage",
]);

/** Synchronous / local methods that touch no network — pass straight through. */
const PASSTHROUGH_METHODS = new Set<keyof ElizaClient>(["hasCryptoSession"]);

export interface ElizaClientResilienceOptions {
	/** Circuit name used in errors + the metrics gauge label. Defaults to the base URL. */
	circuitName?: string;
	/** Override the shared breaker (tests inject a fast-clock breaker). */
	breaker?: CircuitBreaker;
	/** Retry knobs forwarded to withRetry for idempotent GETs. */
	retry?: {
		maxAttempts?: number;
		baseDelayMs?: number;
		maxDelayMs?: number;
		maxTotalTimeMs?: number;
	};
	/** Circuit breaker knobs (ignored when `breaker` is supplied). */
	circuit?: {
		failureThreshold?: number;
		successThreshold?: number;
		halfOpenAfterMs?: number;
	};
}

/**
 * One circuit breaker per (baseUrl / circuit name). All ElizaClient instances
 * built against the same Eliza Cloud base URL share breaker state, so a chat
 * route and the owner-tokens route trip and recover together rather than each
 * keeping an independent failure count.
 */
const breakerRegistry = new Map<string, CircuitBreaker>();

function gaugeOnStateChange(next: CircuitState, _prev: CircuitState, circuitName: string): void {
	// Lazy require so this module has no hard runtime dependency on prom-client at
	// import time and unit tests that stub the client don't pull in the registry.
	void import("@waifufun/metrics")
		.then(({ elizaCloudCircuitBreakerState }) => {
			elizaCloudCircuitBreakerState.set({ circuit: circuitName }, CIRCUIT_STATE_CODE[next]);
		})
		.catch(() => {
			/* metrics are best-effort; never let a gauge update break a request */
		});
}

function getSharedBreaker(circuitName: string, circuit?: ElizaClientResilienceOptions["circuit"]): CircuitBreaker {
	const existing = breakerRegistry.get(circuitName);
	if (existing) return existing;
	const breaker = new CircuitBreaker({
		name: circuitName,
		...(circuit?.failureThreshold !== undefined ? { failureThreshold: circuit.failureThreshold } : {}),
		...(circuit?.successThreshold !== undefined ? { successThreshold: circuit.successThreshold } : {}),
		...(circuit?.halfOpenAfterMs !== undefined ? { halfOpenAfterMs: circuit.halfOpenAfterMs } : {}),
		onStateChange: gaugeOnStateChange,
	});
	breakerRegistry.set(circuitName, breaker);
	return breaker;
}

/** TEST-ONLY: drop cached breakers so each test starts from a closed circuit. */
export function __resetElizaResilienceBreakersForTest(): void {
	breakerRegistry.clear();
}

/**
 * Wrap an existing ElizaClient with circuit breaker + selective retry. Returns a
 * Proxy that intercepts the whitelisted methods and delegates everything else
 * (constructors, fields, unknown methods) straight to the target so the wrapper
 * stays a structural drop-in for ElizaClient as the class grows new methods.
 *
 * Any method NOT in the GET/mutation/passthrough whitelists throws at call time
 * (fail-closed): a new networked method must be classified deliberately, never
 * silently un-guarded.
 */
export function wrapElizaClientWithResilience(
	client: ElizaClient,
	circuitName: string,
	options: ElizaClientResilienceOptions = {},
): ElizaClient {
	const breaker = options.breaker ?? getSharedBreaker(options.circuitName ?? circuitName, options.circuit);
	const retryOptions = options.retry ?? {};

	const runMutation = <T>(operation: string, fn: () => Promise<T>): Promise<T> =>
		guardCircuit(operation, () => breaker.execute(fn));

	const runRetryableGet = <T>(operation: string, fn: () => Promise<T>): Promise<T> =>
		guardCircuit(operation, () =>
			breaker.execute(() =>
				withRetry(fn, {
					isRetryable: isRetryableElizaError,
					...(retryOptions.maxAttempts !== undefined ? { maxAttempts: retryOptions.maxAttempts } : {}),
					...(retryOptions.baseDelayMs !== undefined ? { baseDelayMs: retryOptions.baseDelayMs } : {}),
					...(retryOptions.maxDelayMs !== undefined ? { maxDelayMs: retryOptions.maxDelayMs } : {}),
					...(retryOptions.maxTotalTimeMs !== undefined ? { maxTotalTimeMs: retryOptions.maxTotalTimeMs } : {}),
				}),
			),
		);

	return new Proxy(client, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof value !== "function" || typeof prop !== "string") {
				return value;
			}
			const key = prop as keyof ElizaClient;

			if (PASSTHROUGH_METHODS.has(key)) {
				return value.bind(target);
			}

			if (RETRYABLE_GET_METHODS.has(key)) {
				return (...args: unknown[]) =>
					runRetryableGet(prop, () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args));
			}

			if (MUTATION_METHODS.has(key)) {
				return (...args: unknown[]) =>
					runMutation(prop, () => (value as (...a: unknown[]) => Promise<unknown>).apply(target, args));
			}

			// Unknown method: fail closed rather than silently bypassing resilience.
			return (..._args: unknown[]): never => {
				throw new Error(
					`eliza-client-resilient: method "${prop}" is not classified as a retryable GET, mutation, or passthrough. Add it to the appropriate whitelist in eliza-client-resilient.ts before calling it.`,
				);
			};
		},
	}) as ElizaClient;
}

/**
 * Track the in-flight gauge and translate an open-circuit rejection into the
 * route-facing 503 error. CircuitOpenError is the breaker's internal signal; the
 * rest of the codebase only ever sees ElizaCloudUnavailableError.
 */
async function guardCircuit<T>(operation: string, fn: () => Promise<T>): Promise<T> {
	// Gauge updates are fire-and-forget so the request never waits on prom-client.
	// inc/dec are balanced even when the metrics module is unavailable (both no-op).
	trackOutstanding(operation, +1);
	try {
		return await fn();
	} catch (err) {
		if (err instanceof CircuitOpenError) {
			throw new ElizaCloudUnavailableError(`Eliza Cloud is temporarily unavailable (operation: ${operation})`, {
				circuitName: err.circuitName,
				cause: err,
			});
		}
		throw err;
	} finally {
		trackOutstanding(operation, -1);
	}
}

/**
 * Best-effort in-flight gauge update. Resolved once and cached; a metrics import
 * failure degrades to a no-op rather than breaking (or delaying) the request.
 */
let outstandingGaugePromise:
	| Promise<{ inc: (l: { operation: string }) => void; dec: (l: { operation: string }) => void } | null>
	| undefined;

function trackOutstanding(operation: string, delta: 1 | -1): void {
	if (!outstandingGaugePromise) {
		outstandingGaugePromise = import("@waifufun/metrics")
			.then(({ elizaCloudOutstandingRequests }) => ({
				inc: (l: { operation: string }) => elizaCloudOutstandingRequests.inc(l),
				dec: (l: { operation: string }) => elizaCloudOutstandingRequests.dec(l),
			}))
			.catch(() => null);
	}
	void outstandingGaugePromise.then((gauge) => {
		if (!gauge) return;
		if (delta === 1) gauge.inc({ operation });
		else gauge.dec({ operation });
	});
}

/** TEST-ONLY: expose the method classification for the disjoint/exhaustive guard. */
export const __resilienceMethodSets = {
	retryableGet: RETRYABLE_GET_METHODS,
	mutation: MUTATION_METHODS,
	passthrough: PASSTHROUGH_METHODS,
};
