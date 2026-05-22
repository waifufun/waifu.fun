import { describe, expect, it } from "vitest";

import { normalizeTokenAmount } from "./normalize-amount";

describe("normalizeTokenAmount", () => {
	it("divides raw 18-decimal wei strings by 1e18", () => {
		// 100 WAIFU at 18 decimals
		expect(normalizeTokenAmount("100000000000000000000")).toBeCloseTo(100, 6);
		// 100,000,000 WAIFU at 18 decimals
		expect(normalizeTokenAmount("100000000000000000000000000")).toBeCloseTo(100_000_000, 0);
		// 1.5 WAIFU at 18 decimals
		expect(normalizeTokenAmount("1500000000000000000")).toBeCloseTo(1.5, 6);
	});

	it("passes through already-normalized float strings", () => {
		expect(normalizeTokenAmount("1.23")).toBeCloseTo(1.23, 6);
		expect(normalizeTokenAmount("420")).toBe(420);
		expect(normalizeTokenAmount("0.001")).toBeCloseTo(0.001, 6);
	});

	it("passes through plausible normalized numeric inputs unchanged", () => {
		expect(normalizeTokenAmount(100_000_000)).toBe(100_000_000); // 100M tokens, already normalized
		expect(normalizeTokenAmount(42)).toBe(42);
	});

	it("treats numbers above the 1e15 threshold as raw wei", () => {
		// 1 token in wei
		expect(normalizeTokenAmount(1e18)).toBeCloseTo(1, 6);
	});

	it("returns 0 for missing or junk inputs", () => {
		expect(normalizeTokenAmount(undefined)).toBe(0);
		expect(normalizeTokenAmount(null)).toBe(0);
		expect(normalizeTokenAmount("")).toBe(0);
		expect(normalizeTokenAmount("not a number")).toBe(0);
	});
});
