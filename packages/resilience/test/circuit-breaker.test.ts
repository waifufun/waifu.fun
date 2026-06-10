import assert from "node:assert/strict";
import test from "node:test";

import { CIRCUIT_STATE_CODE, CircuitBreaker, CircuitOpenError, type CircuitState } from "../src/index.js";

/** Controllable clock for deterministic time-based transitions. */
function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
	let t = start;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
	};
}

const ok = () => Promise.resolve("ok");
const fail = () => Promise.reject(new Error("boom"));

async function expectReject(promise: Promise<unknown>, ctor: new (...args: never[]) => Error): Promise<Error> {
	try {
		await promise;
	} catch (err) {
		assert.ok(err instanceof ctor, `expected ${ctor.name}, got ${(err as Error)?.name}`);
		return err as Error;
	}
	throw new Error(`expected rejection with ${ctor.name}`);
}

test("starts closed", () => {
	const cb = new CircuitBreaker({ name: "t" });
	assert.equal(cb.getState(), "closed");
});

test("closed → open after exactly N consecutive failures (default 5)", async () => {
	const cb = new CircuitBreaker({ name: "t" });
	for (let i = 1; i <= 4; i += 1) {
		await expectReject(cb.execute(fail), Error);
		assert.equal(cb.getState(), "closed", `still closed after ${i} failures`);
	}
	// 5th failure trips it.
	await expectReject(cb.execute(fail), Error);
	assert.equal(cb.getState(), "open");
});

test("respects a custom failureThreshold", async () => {
	const cb = new CircuitBreaker({ name: "t", failureThreshold: 2 });
	await expectReject(cb.execute(fail), Error);
	assert.equal(cb.getState(), "closed");
	await expectReject(cb.execute(fail), Error);
	assert.equal(cb.getState(), "open");
});

test("a success resets the consecutive-failure counter (no off-by-one trip)", async () => {
	const cb = new CircuitBreaker({ name: "t", failureThreshold: 3 });
	await expectReject(cb.execute(fail), Error);
	await expectReject(cb.execute(fail), Error);
	await cb.execute(ok); // reset
	// Two more failures must NOT trip (counter restarted).
	await expectReject(cb.execute(fail), Error);
	await expectReject(cb.execute(fail), Error);
	assert.equal(cb.getState(), "closed");
});

test("open circuit rejects with CircuitOpenError WITHOUT calling the wrapped fn", async () => {
	const cb = new CircuitBreaker({ name: "t", failureThreshold: 1 });
	await expectReject(cb.execute(fail), Error);
	assert.equal(cb.getState(), "open");

	let called = false;
	const spy = () => {
		called = true;
		return Promise.resolve("x");
	};
	await expectReject(cb.execute(spy), CircuitOpenError);
	assert.equal(called, false, "wrapped fn must not be invoked while open");
});

test("open → half-open only after the delay elapses", async () => {
	const clock = fakeClock();
	const cb = new CircuitBreaker({ name: "t", failureThreshold: 1, halfOpenAfterMs: 30_000, now: clock.now });
	await expectReject(cb.execute(fail), Error);
	assert.equal(cb.getState(), "open");

	clock.advance(29_999);
	assert.equal(cb.getState(), "open", "still open just before delay");

	clock.advance(1);
	assert.equal(cb.getState(), "half-open", "promotes to half-open at the delay boundary");
});

test("half-open → closed after M consecutive successes (default 2)", async () => {
	const clock = fakeClock();
	const cb = new CircuitBreaker({
		name: "t",
		failureThreshold: 1,
		successThreshold: 2,
		halfOpenAfterMs: 1_000,
		now: clock.now,
	});
	await expectReject(cb.execute(fail), Error);
	clock.advance(1_000);
	assert.equal(cb.getState(), "half-open");

	await cb.execute(ok); // 1st probe success
	assert.equal(cb.getState(), "half-open", "one success is not enough to close");
	await cb.execute(ok); // 2nd probe success
	assert.equal(cb.getState(), "closed");
});

test("half-open → open immediately on a probe failure, and cooldown restarts", async () => {
	const clock = fakeClock();
	const cb = new CircuitBreaker({ name: "t", failureThreshold: 1, halfOpenAfterMs: 1_000, now: clock.now });
	await expectReject(cb.execute(fail), Error);
	clock.advance(1_000);
	assert.equal(cb.getState(), "half-open");

	await expectReject(cb.execute(fail), Error); // probe fails
	assert.equal(cb.getState(), "open");

	// Cooldown restarted from the probe-failure instant.
	clock.advance(999);
	assert.equal(cb.getState(), "open");
	clock.advance(1);
	assert.equal(cb.getState(), "half-open");
});

test("only a single probe is allowed in half-open; concurrent calls fail fast", async () => {
	const clock = fakeClock();
	const cb = new CircuitBreaker({ name: "t", failureThreshold: 1, halfOpenAfterMs: 1_000, now: clock.now });
	await expectReject(cb.execute(fail), Error);
	clock.advance(1_000);
	assert.equal(cb.getState(), "half-open");

	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	// First probe is in-flight (awaiting the gate).
	const probe = cb.execute(async () => {
		await gate;
		return "probe";
	});
	// Second concurrent call must be rejected without running.
	let secondCalled = false;
	await expectReject(
		cb.execute(() => {
			secondCalled = true;
			return Promise.resolve("nope");
		}),
		CircuitOpenError,
	);
	assert.equal(secondCalled, false);

	release();
	assert.equal(await probe, "probe");
});

test("probe-success counter resets each time half-open is entered (no carry-over)", async () => {
	const clock = fakeClock();
	const cb = new CircuitBreaker({
		name: "t",
		failureThreshold: 1,
		successThreshold: 2,
		halfOpenAfterMs: 1_000,
		now: clock.now,
	});
	await expectReject(cb.execute(fail), Error);
	clock.advance(1_000);
	await cb.execute(ok); // 1 success in half-open
	await expectReject(cb.execute(fail), Error); // re-open before closing
	assert.equal(cb.getState(), "open");

	clock.advance(1_000);
	assert.equal(cb.getState(), "half-open");
	await cb.execute(ok); // would close if the earlier success carried over
	assert.equal(cb.getState(), "half-open", "previous probe success must not carry over");
	await cb.execute(ok);
	assert.equal(cb.getState(), "closed");
});

test("onStateChange fires with next/prev/name on every transition", async () => {
	const clock = fakeClock();
	const transitions: Array<{ next: CircuitState; prev: CircuitState; name: string }> = [];
	const cb = new CircuitBreaker({
		name: "eliza",
		failureThreshold: 1,
		successThreshold: 1,
		halfOpenAfterMs: 1_000,
		now: clock.now,
		onStateChange: (next, prev, name) => transitions.push({ next, prev, name }),
	});

	await expectReject(cb.execute(fail), Error); // closed → open
	clock.advance(1_000);
	cb.getState(); // open → half-open (lazy promote)
	await cb.execute(ok); // half-open → closed

	assert.deepEqual(
		transitions.map((t) => `${t.prev}->${t.next}`),
		["closed->open", "open->half-open", "half-open->closed"],
	);
	assert.ok(transitions.every((t) => t.name === "eliza"));
});

test("CIRCUIT_STATE_CODE maps states to gauge values", () => {
	assert.equal(CIRCUIT_STATE_CODE.closed, 0);
	assert.equal(CIRCUIT_STATE_CODE.open, 1);
	assert.equal(CIRCUIT_STATE_CODE["half-open"], 2);
});

test("constructor rejects thresholds < 1", () => {
	assert.throws(() => new CircuitBreaker({ name: "t", failureThreshold: 0 }));
	assert.throws(() => new CircuitBreaker({ name: "t", successThreshold: 0 }));
});
