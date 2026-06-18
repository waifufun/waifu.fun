import assert from "node:assert/strict";
import test from "node:test";

import { computeBackoffMs, withRetry } from "../src/index.js";

const alwaysRetry = () => true;
const neverRetry = () => false;

/** A no-wait sleep that records the requested delays. */
function recordingSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
	const delays: number[] = [];
	return {
		delays,
		sleep: (ms: number) => {
			delays.push(ms);
			return Promise.resolve();
		},
	};
}

/** A clock that advances by whatever sleep() is asked to wait, so total-time math is testable. */
function virtualTime(): { now: () => number; sleep: (ms: number) => Promise<void>; delays: number[] } {
	let t = 0;
	const delays: number[] = [];
	return {
		now: () => t,
		delays,
		sleep: (ms: number) => {
			delays.push(ms);
			t += ms;
			return Promise.resolve();
		},
	};
}

function statusError(status: number): Error & { status: number } {
	const err = new Error(`status ${status}`) as Error & { status: number };
	err.status = status;
	return err;
}

test("computeBackoffMs: exponential 100 → 200 → 400, capped at max", () => {
	assert.equal(computeBackoffMs(1, 100, 10_000), 100);
	assert.equal(computeBackoffMs(2, 100, 10_000), 200);
	assert.equal(computeBackoffMs(3, 100, 10_000), 400);
	assert.equal(computeBackoffMs(8, 100, 10_000), 10_000, "capped at maxDelayMs");
});

test("succeeds on first attempt with no retries", async () => {
	let calls = 0;
	const rec = recordingSleep();
	const result = await withRetry(
		() => {
			calls += 1;
			return Promise.resolve("ok");
		},
		{ isRetryable: alwaysRetry, sleep: rec.sleep },
	);
	assert.equal(result, "ok");
	assert.equal(calls, 1);
	assert.deepEqual(rec.delays, []);
});

test("retries then succeeds on the 3rd attempt (2 failures)", async () => {
	let calls = 0;
	const rec = recordingSleep();
	const result = await withRetry(
		() => {
			calls += 1;
			if (calls < 3) {
				return Promise.reject(statusError(503));
			}
			return Promise.resolve("recovered");
		},
		{ isRetryable: alwaysRetry, sleep: rec.sleep },
	);
	assert.equal(result, "recovered");
	assert.equal(calls, 3);
	// Backoff before attempt 2 and before attempt 3.
	assert.deepEqual(rec.delays, [100, 200]);
});

test("exhausts maxAttempts (default 3) then throws the last error", async () => {
	let calls = 0;
	const rec = recordingSleep();
	await assert.rejects(
		withRetry(
			() => {
				calls += 1;
				return Promise.reject(statusError(500));
			},
			{ isRetryable: alwaysRetry, sleep: rec.sleep },
		),
		(err: unknown) => (err as { status: number }).status === 500,
	);
	assert.equal(calls, 3, "exactly maxAttempts calls");
	assert.deepEqual(rec.delays, [100, 200], "no backoff after the final attempt");
});

test("a non-retryable error throws immediately with no retries", async () => {
	let calls = 0;
	const rec = recordingSleep();
	await assert.rejects(
		withRetry(
			() => {
				calls += 1;
				return Promise.reject(statusError(409));
			},
			{ isRetryable: neverRetry, sleep: rec.sleep },
		),
		(err: unknown) => (err as { status: number }).status === 409,
	);
	assert.equal(calls, 1, "no retry on non-retryable error");
	assert.deepEqual(rec.delays, []);
});

test("POST-style semantics: a never-retry predicate makes mutations single-attempt even on 5xx", async () => {
	let calls = 0;
	await assert.rejects(
		withRetry(
			() => {
				calls += 1;
				return Promise.reject(statusError(503));
			},
			{ isRetryable: neverRetry },
		),
	);
	assert.equal(calls, 1);
});

test("isRetryable predicate is consulted per error (mixed retryable/non-retryable)", async () => {
	let calls = 0;
	const rec = recordingSleep();
	// First failure 503 (retryable), second 409 (not) → stop at attempt 2.
	await assert.rejects(
		withRetry(
			() => {
				calls += 1;
				return Promise.reject(statusError(calls === 1 ? 503 : 409));
			},
			{ isRetryable: (e) => (e as { status: number }).status >= 500, sleep: rec.sleep },
		),
		(err: unknown) => (err as { status: number }).status === 409,
	);
	assert.equal(calls, 2);
	assert.deepEqual(rec.delays, [100]);
});

test("maxTotalTimeMs ceiling stops further attempts before the wall-clock blows", async () => {
	let calls = 0;
	const vt = virtualTime();
	// base 1000 → next backoff 1000; ceiling 1500 means after attempt 1 (elapsed 0 + 1000 < 1500) we wait,
	// but after attempt 2 (elapsed 1000 + 2000 >= 1500) we must stop.
	await assert.rejects(
		withRetry(
			() => {
				calls += 1;
				return Promise.reject(statusError(500));
			},
			{
				isRetryable: alwaysRetry,
				maxAttempts: 10,
				baseDelayMs: 1_000,
				maxDelayMs: 10_000,
				maxTotalTimeMs: 1_500,
				now: vt.now,
				sleep: vt.sleep,
			},
		),
	);
	assert.equal(calls, 2, "stopped by time ceiling, not by maxAttempts");
	assert.deepEqual(vt.delays, [1_000]);
});

test("onRetry hook fires with error, attempt, and delay before each wait", async () => {
	const events: Array<{ attempt: number; delay: number }> = [];
	const rec = recordingSleep();
	let calls = 0;
	await assert.rejects(
		withRetry(
			() => {
				calls += 1;
				return Promise.reject(statusError(500));
			},
			{
				isRetryable: alwaysRetry,
				sleep: rec.sleep,
				onRetry: (_err, attempt, delayMs) => events.push({ attempt, delay: delayMs }),
			},
		),
	);
	assert.deepEqual(events, [
		{ attempt: 1, delay: 100 },
		{ attempt: 2, delay: 200 },
	]);
});

test("maxAttempts: 1 means exactly one try, no backoff", async () => {
	let calls = 0;
	const rec = recordingSleep();
	await assert.rejects(
		withRetry(
			() => {
				calls += 1;
				return Promise.reject(statusError(500));
			},
			{ isRetryable: alwaysRetry, maxAttempts: 1, sleep: rec.sleep },
		),
	);
	assert.equal(calls, 1);
	assert.deepEqual(rec.delays, []);
});

test("constructor-style guard: maxAttempts < 1 throws", async () => {
	await assert.rejects(withRetry(() => Promise.resolve("x"), { isRetryable: alwaysRetry, maxAttempts: 0 }));
});
