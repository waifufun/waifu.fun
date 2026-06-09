import { describe, expect, it as test } from "vitest";

import { calibratedQuoteAmtWei, tierBudget } from "./tier-math";

const ETHER = 10n ** 18n;

describe("calibratedQuoteAmtWei", () => {
	test("0% tax: 16.33 BNB", () => {
		// 16e18 * 10100 / (10000 - 100 - 0) = 16e18 * 10100 / 9900 = 16.323... BNB
		// ceiling: 16.323232323... -> 16323232323232323233
		const got = calibratedQuoteAmtWei(0);
		expect(got).toBe(16323232323232323233n);
	});

	test("3% tax: 16.83 BNB", () => {
		// 16e18 * 10100 / 9600 = 16.833333... BNB
		const got = calibratedQuoteAmtWei(300);
		expect(got).toBe(16833333333333333334n);
	});

	test("5% tax: 17.19 BNB", () => {
		// 16e18 * 10100 / (10000 - 100 - 500) = 16e18 * 10100 / 9400 = 17.1914... BNB
		const got = calibratedQuoteAmtWei(500);
		expect(got).toBe(17191489361702127660n);
	});

	test("10% tax: 18.16 BNB", () => {
		// 16e18 * 10100 / 8900 = 18.157... BNB
		const got = calibratedQuoteAmtWei(1000);
		expect(got).toBe(18157303370786516854n);
	});

	test("rejects buyTaxBps > 1000", () => {
		expect(() => calibratedQuoteAmtWei(1001)).toThrow();
	});

	test("accepts buyTaxBps at exact 1000 cap", () => {
		expect(() => calibratedQuoteAmtWei(1000)).not.toThrow();
	});

	test("monotonic: higher tax => higher quoteAmt", () => {
		const prev = calibratedQuoteAmtWei(0);
		for (let bps = 100; bps <= 1000; bps += 100) {
			const got = calibratedQuoteAmtWei(bps);
			expect(got).toBeGreaterThan(prev);
		}
	});
});

describe("tierBudget", () => {
	test("TIER_80 is curve-only regardless of tax", () => {
		for (const bps of [0, 300, 500, 1000]) {
			const b = tierBudget("TIER_80", bps);
			expect(b.presaleCapWei).toBe(16n * ETHER);
			expect(b.quoteAmtWei).toBe(16n * ETHER);
			expect(b.v2BuyBnbWei).toBe(0n);
			expect(b.vestingEnabled).toBe(false);
		}
	});

	test("TIER_TEST is 2.4 BNB curve-only smoke budget", () => {
		const b = tierBudget("TIER_TEST", 300);
		expect(b.presaleCapWei).toBe(24n * 10n ** 17n);
		expect(b.quoteAmtWei).toBe(24n * 10n ** 17n);
		expect(b.v2BuyBnbWei).toBe(0n);
		expect(b.vestingEnabled).toBe(false);
	});

	test("TIER_90 at 3% tax", () => {
		const b = tierBudget("TIER_90", 300);
		expect(b.presaleCapWei).toBe(32n * ETHER);
		expect(b.quoteAmtWei).toBe(16833333333333333334n);
		expect(b.v2BuyBnbWei).toBe(32n * ETHER - 16833333333333333334n);
		expect(b.vestingEnabled).toBe(true);
	});

	test("TIER_95 at 3% tax", () => {
		const b = tierBudget("TIER_95", 300);
		expect(b.presaleCapWei).toBe(64n * ETHER);
		expect(b.quoteAmtWei).toBe(16833333333333333334n);
		expect(b.v2BuyBnbWei).toBe(64n * ETHER - 16833333333333333334n);
		expect(b.vestingEnabled).toBe(true);
	});

	test("TIER_98 at 3% tax", () => {
		const b = tierBudget("TIER_98", 300);
		expect(b.presaleCapWei).toBe(160n * ETHER);
		expect(b.quoteAmtWei).toBe(16833333333333333334n);
		expect(b.v2BuyBnbWei).toBe(160n * ETHER - 16833333333333333334n);
		expect(b.vestingEnabled).toBe(true);
	});

	test("invariant: presaleCap == quoteAmt + v2BuyBnb across all (tier, tax) pairs", () => {
		for (const tier of ["TIER_80", "TIER_90", "TIER_95", "TIER_98", "TIER_TEST"]) {
			for (const bps of [0, 100, 300, 500, 700, 1000]) {
				const b = tierBudget(tier, bps);
				expect(b.quoteAmtWei + b.v2BuyBnbWei).toBe(b.presaleCapWei);
			}
		}
	});

	test("unknown tier throws", () => {
		expect(() => tierBudget("TIER_99", 300)).toThrow();
	});
});
