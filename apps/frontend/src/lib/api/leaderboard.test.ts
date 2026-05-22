import { describe, expect, it } from "vitest";

import { formatRunway } from "./leaderboard";

describe("formatRunway", () => {
	it("returns an en-dash for non-finite runway (no burn data yet)", () => {
		// Pre-launch agents and fresh launches report dailyBurnUsd=0, which the
		// runway calc maps to +Infinity. Math-correct but visually noisy on a
		// leaderboard with one entry. The dash reads as "no data" instead of
		// "this agent lives forever". Matches the en-dash placeholder used on
		// the homepage stat cells.
		expect(formatRunway(Number.POSITIVE_INFINITY)).toBe("–");
		expect(formatRunway(Number.NaN)).toBe("–");
	});

	it("formats whole days with locale separators", () => {
		expect(formatRunway(1)).toBe("1 day");
		expect(formatRunway(2)).toBe("2 days");
		expect(formatRunway(1_234)).toBe("1,234 days");
	});

	it("falls back to hours when runway is under a day", () => {
		// 12 hours -> 0.5 day -> "12h"
		expect(formatRunway(0.5)).toBe("12h");
		// floor to at least 1h
		expect(formatRunway(1 / 24 / 60)).toBe("1h");
	});

	it("renders 0 days for zero runway", () => {
		expect(formatRunway(0)).toBe("0 days");
		expect(formatRunway(-1)).toBe("0 days");
	});
});
