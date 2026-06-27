/**
 * Bounded retry with exponential backoff for idempotent Eliza Cloud calls.
 *
 * Only ever applied to operations that are safe to repeat (idempotent GETs).
 * Whether a given failure is retried is delegated entirely to the `isRetryable`
 * predicate so POST/DELETE callers can pass a never-retry predicate and the
 * "5xx/timeout only" semantics live in one place (isRetryableElizaError).
 */

export interface RetryOptions {
	/** Total attempts including the first. Default 3. */
	maxAttempts?: number;
	/** Base backoff in ms for the first retry. Default 100. */
	baseDelayMs?: number;
	/** Per-attempt backoff ceiling in ms. Default 10_000. */
	maxDelayMs?: number;
	/** Hard ceiling on cumulative wall-clock time across all attempts+waits, in ms. Default 40_000. */
	maxTotalTimeMs?: number;
	/** Returns true if the given error should trigger another attempt. */
	isRetryable: (error: unknown) => boolean;
	/** Injectable clock for deterministic tests. Defaults to Date.now. */
	now?: () => number;
	/** Injectable sleep for deterministic tests. Defaults to setTimeout-based delay. */
	sleep?: (ms: number) => Promise<void>;
	/** Optional hook fired before each backoff wait (attempt is 1-based, the attempt that just failed). */
	onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 10_000;
const DEFAULT_MAX_TOTAL_TIME_MS = 40_000;

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff: base * 2^(attempt-1), capped at maxDelayMs. attempt is 1-based. */
export function computeBackoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
	const raw = baseDelayMs * 2 ** (attempt - 1);
	return Math.min(raw, maxDelayMs);
}

/**
 * Execute `fn`, retrying on retryable errors up to the attempt and total-time
 * ceilings. The last error is re-thrown when attempts/time are exhausted or the
 * error is classified non-retryable. A non-retryable error is thrown immediately
 * with no further attempts.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
	const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
	const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
	const maxTotalTimeMs = options.maxTotalTimeMs ?? DEFAULT_MAX_TOTAL_TIME_MS;
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? defaultSleep;

	if (maxAttempts < 1) {
		throw new Error("maxAttempts must be >= 1");
	}

	const startMs = now();
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;

			// Non-retryable, or out of attempts → fail immediately with the original error.
			if (!options.isRetryable(err) || attempt >= maxAttempts) {
				throw err;
			}

			const delayMs = computeBackoffMs(attempt, baseDelayMs, maxDelayMs);
			const elapsedMs = now() - startMs;

			// Would the next attempt's backoff blow the total-time ceiling? If so, stop now.
			if (elapsedMs + delayMs >= maxTotalTimeMs) {
				throw err;
			}

			options.onRetry?.(err, attempt, delayMs);
			await sleep(delayMs);
		}
	}

	// Unreachable in practice (loop either returns or throws), but satisfies the type checker.
	throw lastError;
}
