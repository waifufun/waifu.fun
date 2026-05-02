import { describe, expect, it } from "vitest";
import { DEFAULT_FLAP, DEFAULT_FOUR_MEME_TAX } from "./fee-defaults";
import { DEFAULT_PLATFORM_CUT_BPS, MAX_PLATFORM_CUT_BPS, MIN_PLATFORM_CUT_BPS } from "./types";
import { computePlatformCutVolumeBps, sumAllocationBps, validateFlap, validateFourMemeTax } from "./validators";

describe("sumAllocationBps", () => {
	it("sums correctly for the default config (= 10000 - platform cut)", () => {
		expect(sumAllocationBps(DEFAULT_FOUR_MEME_TAX.allocation)).toBe(10_000 - DEFAULT_FOUR_MEME_TAX.platformCutBps);
	});

	it("returns the literal sum, not a normalized value", () => {
		expect(sumAllocationBps({ founderBps: 4000, holderBps: 3000, burnBps: 1500, liquidityBps: 1500 })).toBe(10_000);
		expect(sumAllocationBps({ founderBps: 1000, holderBps: 1000, burnBps: 1000, liquidityBps: 1000 })).toBe(4_000);
	});
});

describe("computePlatformCutVolumeBps", () => {
	it("at 3% tax + 25% platform cut → 0.75% of volume = 75 bps", () => {
		expect(computePlatformCutVolumeBps(300, 2500)).toBe(75);
	});

	it("at 1% tax + 25% platform cut → 0.25% of volume = 25 bps", () => {
		expect(computePlatformCutVolumeBps(100, 2500)).toBe(25);
	});

	it("scales linearly with tax tier", () => {
		const at1 = computePlatformCutVolumeBps(100, 2500);
		const at3 = computePlatformCutVolumeBps(300, 2500);
		const at10 = computePlatformCutVolumeBps(1000, 2500);
		expect(at3).toBe(at1 * 3);
		expect(at10).toBe(at1 * 10);
	});

	it("returns 0 when tax is 0 OR platform cut is 0", () => {
		expect(computePlatformCutVolumeBps(0, 2500)).toBe(0);
		expect(computePlatformCutVolumeBps(300, 0)).toBe(0);
	});
});

describe("validateFourMemeTax", () => {
	it("accepts the default config", () => {
		const result = validateFourMemeTax(DEFAULT_FOUR_MEME_TAX);
		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it("rejects when allocations do not sum to (10000 - platformCutBps)", () => {
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
		expect(result.errors[0]).toMatch(/sum to/i);
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

	it("warns when platform cut is below MIN bound", () => {
		const result = validateFourMemeTax({
			kind: "four-meme-tax",
			taxBps: 300,
			platformCutBps: 500, // 5%, below 10% min
			allocation: { founderBps: 9500, holderBps: 0, burnBps: 0, liquidityBps: 0 },
			minHolderBalance: "10000",
		});
		expect(result.warnings.length).toBe(1);
		expect(result.warnings[0]).toMatch(/below the/);
	});

	it("warns when platform cut is above MAX bound", () => {
		const result = validateFourMemeTax({
			kind: "four-meme-tax",
			taxBps: 300,
			platformCutBps: 6000, // 60%, above 50% max
			allocation: { founderBps: 4000, holderBps: 0, burnBps: 0, liquidityBps: 0 },
			minHolderBalance: "10000",
		});
		expect(result.warnings.length).toBe(1);
		expect(result.warnings[0]).toMatch(/above the/);
	});

	it("clears warnings at default platform cut", () => {
		const result = validateFourMemeTax({
			kind: "four-meme-tax",
			taxBps: 300,
			platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
			allocation: { founderBps: 3750, holderBps: 2250, burnBps: 750, liquidityBps: 750 },
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
		const result = validateFlap({
			kind: "flap",
			taxBps: 300,
			platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
			recipient: "custom-vault",
		});
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toMatch(/vault address/i);
	});

	it("rejects custom-vault with a malformed address", () => {
		const result = validateFlap({
			kind: "flap",
			taxBps: 300,
			platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
			recipient: "custom-vault",
			customVaultAddress: "0xnotahex",
		});
		expect(result.ok).toBe(false);
	});

	it("accepts custom-vault with a valid 0x40 hex address", () => {
		const result = validateFlap({
			kind: "flap",
			taxBps: 500,
			platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
			recipient: "custom-vault",
			customVaultAddress: `0x${"a".repeat(40)}`,
		});
		expect(result.ok).toBe(true);
	});

	it("rejects out-of-range platform cut", () => {
		const result = validateFlap({
			kind: "flap",
			taxBps: 300,
			platformCutBps: -100,
			recipient: "agent-treasury",
		});
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => /platform cut/i.test(e))).toBe(true);
	});

	// Sanity: bounds export check
	it("exports MIN < MAX", () => {
		expect(MIN_PLATFORM_CUT_BPS).toBeLessThan(MAX_PLATFORM_CUT_BPS);
	});
});
