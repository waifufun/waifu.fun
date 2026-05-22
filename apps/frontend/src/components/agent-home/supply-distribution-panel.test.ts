/**
 * Sanity tests for SupplyDistributionPanel pure helpers. These mirror
 * the percentage math used to size the stacked bar segments — keep them
 * in sync with the production implementation.
 */
import { describe, expect, it } from "vitest";

function pctOf(part: bigint, whole: bigint): number {
	if (whole === 0n) return 0;
	const scaled = Number((part * 10_000n) / whole);
	return scaled / 100;
}

const ONE_E18 = 10n ** 18n;
const ONE_B = 1_000_000_000n * ONE_E18;

describe("SupplyDistributionPanel.pctOf", () => {
	it("64.47% burned (Sol's launch state) computes accurately", () => {
		const burned = 644_772_652n * ONE_E18;
		expect(pctOf(burned, ONE_B)).toBeCloseTo(64.47, 1);
	});

	it("100M / 1B treasury allocation reads as 10.00%", () => {
		const safeBal = 100_000_000n * ONE_E18;
		expect(pctOf(safeBal, ONE_B)).toBe(10);
	});

	it("200M / 1B presaler pool reads as 20.00%", () => {
		const vault = 200_000_000n * ONE_E18;
		expect(pctOf(vault, ONE_B)).toBe(20);
	});

	it("zero supply returns 0 percent (no divide-by-zero crash)", () => {
		expect(pctOf(100n, 0n)).toBe(0);
	});

	it("part > whole (shouldn't happen but defensive) does not throw", () => {
		// (1.5e9 * 10000) / 1e9 = 15000 / 100 = 150
		expect(pctOf(15n * ONE_E18, 10n * ONE_E18)).toBe(150);
	});
});
