import { describe, expect, it } from "vitest";
import { DEFAULT_FOUR_MEME_TAX, DEFAULT_FLAP } from "./fee-defaults";
import {
	computePlatformCutBps,
	minFounderBpsForFloor,
	sumAllocationBps,
	validateFlap,
	validateFourMemeTax,
} from "./validators";

describe("sumAllocationBps", () => {
	it("sums to 10000 for the default config", () => {
		expect(sumAllocationBps(DEFAULT_FOUR_MEME_TAX.allocation)).toBe(10_000);
	});

	it("returns the literal sum, not a normalized value", () => {
		expect(sumAllocationBps({ founderBps: 4000, holderBps: 3000, burnBps: 1500, liquidityBps: 1500 })).toBe(10_000);
		expect(sumAllocationBps({ founderBps: 5000, holderBps: 3000, burnBps: 1500, liquidityBps: 1500 })).toBe(11_000);
		expect(sumAllocationBps({ founderBps: 1000, holderBps: 1000, burnBps: 1000, liquidityBps: 1000 })).toBe(4_000);
	});
});

describe("computePlatformCutBps", () => {
	it("matches spec: 3% tax × 40% founder × 20% platform = 0.24% of volume = 24 bps", () => {
		expect(computePlatformCutBps(300, 4000)).toBe(24);
	});

	it("returns 0 when tax is 0", () => {
		expect(computePlatformCutBps(0, 4000)).toBe(0);
	});

	it("returns 0 when founder allocation is 0", () => {
		expect(computePlatformCutBps(300, 0)).toBe(0);
	});

	it("scales linearly with tax tier", () => {
		const at1 = computePlatformCutBps(100, 4000);
		const at3 = computePlatformCutBps(300, 4000);
		const at10 = computePlatformCutBps(1000, 4000);
		expect(at3).toBe(at1 * 3);
		expect(at10).toBe(at1 * 10);
	});

	it("clears the 0.5% floor at 5% tax + 50% founder", () => {
		expect(computePlatformCutBps(500, 5000)).toBe(50);
	});
});

describe("minFounderBpsForFloor", () => {
	it("requires high founder allocation at low tax tier", () => {
		const min1pct = minFounderBpsForFloor(100);
		expect(min1pct).toBeGreaterThan(2500);
	});

	it("requires lower founder allocation at higher tax tier", () => {
		const min1pct = minFounderBpsForFloor(100);
		const min10pct = minFounderBpsForFloor(1000);
		expect(min10pct).toBeLessThan(min1pct);
	});

	it("never exceeds 100% even for absurdly low taxes", () => {
		expect(minFounderBpsForFloor(1)).toBe(10_000);
	});

	it("returns 10_000 (caps) when tax is 0", () => {
		expect(minFounderBpsForFloor(0)).toBe(10_000);
	});

	it("at 3% tax, requires founder >= 84% to clear floor (rounded)", () => {
		// 50 bps * 1e8 / (300 * 2000) = 8333.33... → ceil = 8334
		expect(minFounderBpsForFloor(300)).toBe(8334);
	});
});

describe("validateFourMemeTax", () => {
	it("accepts the default config when sum is 10000 and floor warning may trigger", () => {
		const result = validateFourMemeTax(DEFAULT_FOUR_MEME_TAX);
		// Default 40% founder × 3% tax = 24 bps platform cut → BELOW 50 bps floor.
		// Spec says: warn (not error) and provide a CTA. So validation is "ok" but warns.
		expect(result.errors).toEqual([]);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.ok).toBe(true);
	});

	it("rejects when allocations do not sum to 100%", () => {
		const result = validateFourMemeTax({
			...DEFAULT_FOUR_MEME_TAX,
			allocation: {
				founderBps: 5000,
				holderBps: 3000,
				burnBps: 1500,
				liquidityBps: 1500,
			},
		});
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/sum to 100%/i);
	});

	it("rejects negative allocations", () => {
		const result = validateFourMemeTax({
			...DEFAULT_FOUR_MEME_TAX,
			allocation: {
				founderBps: 11_000,
				holderBps: -1000,
				burnBps: 0,
				liquidityBps: 0,
			},
		});
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => /negative/i.test(e))).toBe(true);
	});

	it("warns at 3% tax + 40% founder (below floor) but stays ok", () => {
		const result = validateFourMemeTax({
			kind: "four-meme-tax",
			taxBps: 300,
			allocation: {
				founderBps: 4000,
				holderBps: 3000,
				burnBps: 1500,
				liquidityBps: 1500,
			},
			minHolderBalance: "10000",
		});
		expect(result.warnings.length).toBe(1);
		expect(result.warnings[0]).toMatch(/below the 0.5% prod floor/);
	});

	it("clears warnings at 5% tax + 50% founder allocation", () => {
		const result = validateFourMemeTax({
			kind: "four-meme-tax",
			taxBps: 500,
			allocation: {
				founderBps: 5000,
				holderBps: 3000,
				burnBps: 1000,
				liquidityBps: 1000,
			},
			minHolderBalance: "10000",
		});
		expect(result.warnings).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it("rejects malformed minHolderBalance", () => {
		const result = validateFourMemeTax({ ...DEFAULT_FOUR_MEME_TAX, minHolderBalance: "abc" });
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => /min holder balance/i.test(e))).toBe(true);
	});
});

describe("validateFlap", () => {
	it("accepts default agent-treasury config", () => {
		expect(validateFlap(DEFAULT_FLAP).ok).toBe(true);
	});

	it("rejects custom-vault without an address", () => {
		const result = validateFlap({ kind: "flap", taxBps: 300, recipient: "custom-vault" });
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/vault address/i);
	});

	it("rejects custom-vault with a malformed address", () => {
		const result = validateFlap({
			kind: "flap",
			taxBps: 300,
			recipient: "custom-vault",
			customVaultAddress: "0xnotahex",
		});
		expect(result.ok).toBe(false);
	});

	it("accepts custom-vault with a valid 0x40 hex address", () => {
		const result = validateFlap({
			kind: "flap",
			taxBps: 500,
			recipient: "custom-vault",
			customVaultAddress: `0x${"a".repeat(40)}`,
		});
		expect(result.ok).toBe(true);
	});
});
