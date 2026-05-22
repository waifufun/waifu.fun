import { describe, expect, it } from "vitest";

import { formatRunway } from "./leaderboard";

describe("formatRunway", () => {
	it("returns 'no burn' for non-finite runway (no burn data yet)", () => {
		// Pre-launch agents and fresh launches report dailyBurnUsd=0, which the
		// runway calc maps to +Infinity. The leaderboard surfaces honest "no burn"
		// copy in wave-t grammar rather than infinity or a bare en-dash glyph.
		expect(formatRunway(Number.POSITIVE_INFINITY)).toBe("no burn");
		expect(formatRunway(Number.NaN)).toBe("no burn");
	});

	it("formats whole days in compact wave-t grammar", () => {
		expect(formatRunway(1)).toBe("1d");
		expect(formatRunway(2)).toBe("2d");
		expect(formatRunway(999)).toBe("999d");
		// >= 1000 days switches to k notation to keep cell width bounded
		expect(formatRunway(1_234)).toBe("1.2k d");
	});

	it("falls back to hours when runway is under a day", () => {
		// 12 hours -> 0.5 day -> "12h"
		expect(formatRunway(0.5)).toBe("12h");
		// floor to at least 1h
		expect(formatRunway(1 / 24 / 60)).toBe("1h");
	});

	it("renders 0d for zero or negative runway", () => {
		expect(formatRunway(0)).toBe("0d");
		expect(formatRunway(-1)).toBe("0d");
	});
});
