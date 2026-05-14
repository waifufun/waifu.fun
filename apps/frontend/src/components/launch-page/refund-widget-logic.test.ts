import { describe, expect, it } from "vitest";

import { computeBonusShare, computeRefundAmount, normalizeRefundError } from "./refund-widget-logic";

const ONE_BNB = 10n ** 18n;

describe("computeBonusShare", () => {
	it("returns 0 when bonusPool is null", () => {
		expect(computeBonusShare(ONE_BNB, ONE_BNB * 10n, null)).toBe(0n);
	});

	it("returns 0 when bonusPool is 0", () => {
		expect(computeBonusShare(ONE_BNB, ONE_BNB * 10n, 0n)).toBe(0n);
	});

	it("returns 0 when principal is 0", () => {
		expect(computeBonusShare(0n, ONE_BNB * 10n, ONE_BNB)).toBe(0n);
	});

	it("returns 0 when totalDeposited is 0 (avoids divide-by-zero)", () => {
		expect(computeBonusShare(ONE_BNB, 0n, ONE_BNB)).toBe(0n);
	});

	it("returns the full bonusPool when the user is the only depositor", () => {
		expect(computeBonusShare(ONE_BNB, ONE_BNB, ONE_BNB / 2n)).toBe(ONE_BNB / 2n);
	});

	it("computes pro-rata share for partial deposits", () => {
		// principal = 2 BNB, total = 10 BNB, bonus = 5 BNB → share = 1 BNB
		const principal = ONE_BNB * 2n;
		const total = ONE_BNB * 10n;
		const bonus = ONE_BNB * 5n;
		expect(computeBonusShare(principal, total, bonus)).toBe(ONE_BNB);
	});

	it("mirrors on-chain integer division (no rounding tricks)", () => {
		// 1 BNB of 3 BNB total, bonus pool of 1 BNB → 1/3 of 1 BNB exact integer math
		const principal = ONE_BNB;
		const total = ONE_BNB * 3n;
		const bonus = ONE_BNB;
		// (1e18 * 1e18) / 3e18 = 1e18 / 3 = 333333333333333333
		expect(computeBonusShare(principal, total, bonus)).toBe(333333333333333333n);
	});
});

describe("computeRefundAmount", () => {
	it("returns principal alone when there is no bonus pool", () => {
		expect(computeRefundAmount(ONE_BNB, ONE_BNB * 10n, null)).toBe(ONE_BNB);
		expect(computeRefundAmount(ONE_BNB, ONE_BNB * 10n, 0n)).toBe(ONE_BNB);
	});

	it("returns principal + bonus share", () => {
		const principal = ONE_BNB * 2n;
		const total = ONE_BNB * 10n;
		const bonus = ONE_BNB * 5n;
		expect(computeRefundAmount(principal, total, bonus)).toBe(principal + ONE_BNB);
	});

	it("returns 0 when principal is 0 regardless of bonus pool", () => {
		expect(computeRefundAmount(0n, ONE_BNB * 10n, ONE_BNB)).toBe(0n);
	});
});

describe("normalizeRefundError", () => {
	it("returns a default for null/undefined", () => {
		expect(normalizeRefundError(null)).toBe("refund failed.");
		expect(normalizeRefundError(undefined)).toBe("refund failed.");
	});

	it("detects user rejection", () => {
		expect(normalizeRefundError(new Error("User rejected the request."))).toMatch(/rejected/i);
		expect(normalizeRefundError(new Error("user denied transaction signature"))).toMatch(/rejected/i);
	});

	it("detects the NoDeposit revert", () => {
		expect(normalizeRefundError(new Error("execution reverted: NoDeposit()"))).toMatch(/no deposit/i);
	});

	it("detects the InvalidState revert", () => {
		expect(normalizeRefundError(new Error("execution reverted: InvalidState()"))).toMatch(/no longer in refund/i);
	});

	it("falls back to the first line for short generic errors", () => {
		expect(normalizeRefundError(new Error("network glitch"))).toBe("network glitch");
	});

	it("falls back to the generic message for very long errors", () => {
		const huge = "x".repeat(500);
		expect(normalizeRefundError(new Error(huge))).toBe("refund failed. try again.");
	});
});
