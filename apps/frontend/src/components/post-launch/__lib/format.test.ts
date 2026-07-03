import { describe, expect, it } from "vitest";

import {
	burnedPercent,
	formatBnb,
	formatTokenAmount,
	formatUsdCompact,
	formatUsdFromChainlink,
	formatVolumeUsd,
	shortAddress,
	vestingProgress,
} from "./format";

describe("formatTokenAmount", () => {
	it("groups thousands and trims trailing fraction zeros", () => {
		expect(formatTokenAmount(1_234_000_000_000_000_000_000n, 18)).toBe("1,234");
	});

	it("keeps up to two fractional digits by default and strips trailing zeros", () => {
		expect(formatTokenAmount(1_234_560_000_000_000_000_000n, 18)).toBe("1,234.56");
		expect(formatTokenAmount(1_500_000_000_000_000_000n, 18)).toBe("1.5");
	});

	it("respects an explicit maxFracDigits", () => {
		expect(formatTokenAmount(1_234_567_890_000_000_000n, 18, 4)).toBe("1.2345");
	});

	it("handles zero", () => {
		expect(formatTokenAmount(0n, 18)).toBe("0");
	});
});

describe("formatBnb", () => {
	it("renders up to 4 fractional digits, no grouping", () => {
		expect(formatBnb(123_456_000_000_000_000n)).toBe("0.1234");
		expect(formatBnb(1_000_000_000_000_000_000n)).toBe("1");
	});
});

describe("formatUsdCompact", () => {
	it("compresses to k / m / b", () => {
		expect(formatUsdCompact(500)).toBe("$500");
		expect(formatUsdCompact(1_500)).toBe("$1.5k");
		expect(formatUsdCompact(1_500_000)).toBe("$1.50m");
		expect(formatUsdCompact(2_300_000_000)).toBe("$2.30b");
	});

	it("guards against NaN / Infinity / negative", () => {
		expect(formatUsdCompact(Number.NaN)).toBe("$0");
		expect(formatUsdCompact(Number.POSITIVE_INFINITY)).toBe("$0");
		expect(formatUsdCompact(-1)).toBe("$0");
	});
});

describe("formatUsdFromChainlink", () => {
	it("decodes 1e8 chainlink-style bigints", () => {
		expect(formatUsdFromChainlink(1_500_00_000_000n)).toBe("$1.5k");
		expect(formatUsdFromChainlink(1_500_000_00_000_000n)).toBe("$1.50m");
	});
});

describe("burnedPercent", () => {
	it("returns 0 on zero supply", () => {
		expect(burnedPercent(0n, 0n)).toBe(0);
		expect(burnedPercent(100n, 0n)).toBe(0);
	});

	it("returns burned share at 2-decimal precision", () => {
		expect(burnedPercent(50n, 1000n)).toBe(5);
		expect(burnedPercent(1n, 8n)).toBe(12.5);
	});
});

describe("shortAddress", () => {
	it("truncates a full address", () => {
		expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234\u20265678");
	});
	it("returns the input if too short to truncate", () => {
		expect(shortAddress("0xabc")).toBe("0xabc");
		expect(shortAddress("")).toBe("");
		expect(shortAddress(undefined)).toBe("");
	});
});

describe("vestingProgress", () => {
	it("returns the 50% tge baseline at t=0", () => {
		const out = vestingProgress(1000, 1000);
		expect(out.pct).toBe(50);
		expect(out.remainingSecs).toBe(30 * 24 * 60 * 60);
	});

	it("interpolates linearly to 100% over the 30d window", () => {
		const launch = 1_000_000;
		const half = launch + 15 * 24 * 60 * 60;
		const out = vestingProgress(launch, half);
		expect(out.pct).toBeGreaterThan(74.9);
		expect(out.pct).toBeLessThan(75.1);
		expect(out.remainingSecs).toBe(15 * 24 * 60 * 60);
	});

	it("clamps at 100% after the window", () => {
		const out = vestingProgress(0, 30 * 24 * 60 * 60 + 1);
		expect(out.pct).toBe(100);
		expect(out.remainingSecs).toBe(0);
	});
});

describe("formatVolumeUsd", () => {
	it("renders a dash for null / non-positive", () => {
		expect(formatVolumeUsd(null)).toBe("\u2013");
		expect(formatVolumeUsd(0)).toBe("\u2013");
		expect(formatVolumeUsd(-5)).toBe("\u2013");
	});

	it("delegates to the compact formatter for positive numbers", () => {
		expect(formatVolumeUsd(1234)).toBe("$1.2k");
	});
});
