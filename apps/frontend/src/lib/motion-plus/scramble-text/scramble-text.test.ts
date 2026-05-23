// Test set adapted from the Motion+ source (motion-plus-dom@2.11.3).
//
// Exercises the standalone scramble engine via the MotionValue path so
// we don't need a DOM. The MotionValue contract is just `get`/`set`, so we
// stub a minimal object that satisfies the runtime duck-type check.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MotionValue } from "framer-motion";

import { scrambleText } from "./scramble-text";

type StringMV = MotionValue<string>;

function mockMotionValue(initial: string): StringMV {
	let value = initial;
	const mv = {
		get: () => value,
		set: (next: string) => {
			value = next;
		},
	};
	// We satisfy only the surface the engine touches; the cast keeps the
	// public type honest at call sites.
	return mv as unknown as StringMV;
}

describe("scrambleText (motion-value mode)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("returns the original text after the longest reveal window elapses", async () => {
		const mv = mockMotionValue("HELLO");
		const controls = scrambleText(mv, { duration: 0.1, interval: 0.02 });

		vi.advanceTimersByTime(200);
		await controls.finished;
		expect(mv.get()).toBe("HELLO");
	});

	it("preserves spaces in the output", () => {
		const mv = mockMotionValue("AB CD");
		scrambleText(mv, { duration: 0.05, interval: 0.01 });

		// While scrambling, only the letter positions should change.
		// We can't assert exact mid-flight chars, but space alignment must hold.
		const display = mv.get();
		expect(display).toHaveLength(5);
		expect(display[2]).toBe(" ");
	});

	it("uses the supplied chars list for scramble glyphs", () => {
		const mv = mockMotionValue("X");
		scrambleText(mv, {
			duration: 1, // long enough to keep it scrambling
			interval: 0.01,
			chars: "@",
		});
		vi.advanceTimersByTime(15);
		const display = mv.get();
		// Either still showing the "@" scramble char or already past it; either way
		// the only non-original char we'd see is "@".
		expect(display === "X" || display === "@").toBe(true);
	});

	it("stop() reveals all chars immediately", () => {
		const mv = mockMotionValue("ABCDE");
		const controls = scrambleText(mv, { duration: 10, interval: 0.05 });

		controls.stop();
		expect(mv.get()).toBe("ABCDE");
	});

	it("finish() resolves the finished promise and lands on the original", async () => {
		const mv = mockMotionValue("DONE");
		const controls = scrambleText(mv, { duration: 0.1, interval: 0.02 });

		controls.finish();
		vi.advanceTimersByTime(150);
		await controls.finished;
		expect(mv.get()).toBe("DONE");
	});

	it("calls onComplete when the longest character reveals", async () => {
		const onComplete = vi.fn();
		const mv = mockMotionValue("XY");
		const controls = scrambleText(mv, {
			duration: 0.05,
			interval: 0.01,
			onComplete,
		});

		vi.advanceTimersByTime(100);
		await controls.finished;
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("supports a stagger function for per-char duration", async () => {
		const mv = mockMotionValue("ABC");
		const controls = scrambleText(mv, {
			duration: (i) => 0.02 + i * 0.02,
			interval: 0.01,
		});

		vi.advanceTimersByTime(200);
		await controls.finished;
		expect(mv.get()).toBe("ABC");
	});
});
