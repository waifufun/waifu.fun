import { describe, expect, it } from "vitest";

import { formatRemainingHumanized } from "./countdown-format";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRemainingHumanized", () => {
	it("returns 'closed' when ms <= 0", () => {
		expect(formatRemainingHumanized(0)).toBe("closed");
		expect(formatRemainingHumanized(-100)).toBe("closed");
	});

	it("formats >=1h with days when applicable", () => {
		expect(formatRemainingHumanized(2 * DAY + 4 * HOUR + 17 * MIN)).toBe("2d 4h 17m");
	});

	it("drops days when <1d", () => {
		expect(formatRemainingHumanized(3 * HOUR + 5 * MIN)).toBe("3h 5m");
	});

	it("uses mm ss format when <1h", () => {
		expect(formatRemainingHumanized(47 * MIN + 23 * SEC)).toBe("47m 23s");
	});

	it("pads seconds to two digits", () => {
		expect(formatRemainingHumanized(1 * MIN + 5 * SEC)).toBe("1m 05s");
	});

	it("handles infinity and NaN gracefully", () => {
		expect(formatRemainingHumanized(Number.POSITIVE_INFINITY)).toBe("closed");
		expect(formatRemainingHumanized(Number.NaN)).toBe("closed");
	});
});
