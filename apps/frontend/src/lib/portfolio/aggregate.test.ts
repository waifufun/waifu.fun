import { describe, expect, it } from "vitest";

import type { UserLaunchEntry } from "@/lib/api/portfolio";

import { aggregatePortfolio } from "./aggregate";
import { formatBnb, formatBnbDelta, impliedBnbValue } from "./format";

const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;

function baseEntry(overrides: Partial<UserLaunchEntry["launch"]> = {}, position?: Partial<UserLaunchEntry["position"]>): UserLaunchEntry {
	return {
		launch: {
			id: "00000000-0000-0000-0000-000000000000",
			token: "0x0",
			vault: "0x0",
			router: "0x0",
			treasuryLp: null,
			creator: "0x0",
			tier: 80,
			state: "open",
			totalDeposited: "0",
			bonusPool: "0",
			depositorCount: 0,
			capacity: "0",
			v2BuyBnb: "0",
			vestingEnabled: false,
			closeTimestamp: null,
			launchTimestamp: null,
			v2Pair: null,
			openMcBnb: null,
			metadataUri: null,
			metadata: {},
			createTxHash: null,
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
			...overrides,
		},
		position: {
			deposited: "0",
			grossDeposited: "0",
			withdrawn: "0",
			claimed: "0",
			claimable: null,
			totalAllocation: null,
			vestingProgress: 0,
			...position,
		},
	};
}

describe("formatBnb", () => {
	it("formats wei to ether with sane precision tiers", () => {
		expect(formatBnb(0n)).toBe("0");
		expect(formatBnb(10n ** 18n)).toBe("1.000");
		expect(formatBnb(10n ** 18n * 1500n)).toBe("1500.0");
		expect(formatBnb(10n ** 15n)).toBe("0.0010"); // 0.001 bnb
	});

	it("falls back gracefully on bad inputs", () => {
		expect(formatBnb(null)).toBe("0");
		expect(formatBnb(undefined)).toBe("0");
		expect(formatBnb("not-a-number")).toBe("0");
	});
});

describe("formatBnbDelta", () => {
	it("uses + for non-negative and - for negative", () => {
		expect(formatBnbDelta(10n ** 18n)).toMatch(/^\+1\./);
		expect(formatBnbDelta(-(10n ** 18n))).toMatch(/^-1\./);
		expect(formatBnbDelta(0n)).toBe("0");
	});
});

describe("impliedBnbValue", () => {
	it("computes mc * alloc / total_supply", () => {
		// 1% of total supply at 100 bnb open MC → 1 bnb
		const oneHundredBnb = 100n * 10n ** 18n;
		const onePercent = TOTAL_SUPPLY / 100n;
		expect(impliedBnbValue(onePercent.toString(), oneHundredBnb.toString())).toBe(10n ** 18n);
	});

	it("returns null for missing inputs", () => {
		expect(impliedBnbValue(null, "1")).toBeNull();
		expect(impliedBnbValue("1", null)).toBeNull();
	});
});

describe("aggregatePortfolio", () => {
	it("sums net deposit across entries", () => {
		const entries = [
			baseEntry({}, { deposited: (10n ** 18n).toString() }),
			baseEntry({}, { deposited: (2n * 10n ** 18n).toString() }),
		];
		const totals = aggregatePortfolio(entries);
		expect(totals.investedWei).toBe(3n * 10n ** 18n);
		expect(totals.count).toBe(2);
	});

	it("ignores realized/unrealized for non-launched rows", () => {
		const entries = [
			baseEntry(
				{ state: "open", openMcBnb: (100n * 10n ** 18n).toString() },
				{ deposited: (1n * 10n ** 18n).toString(), claimed: (TOTAL_SUPPLY / 100n).toString() },
			),
		];
		const totals = aggregatePortfolio(entries);
		expect(totals.realizedWei).toBe(0n);
		expect(totals.unrealizedWei).toBe(0n);
	});

	it("computes realized + unrealized for launched rows", () => {
		// alloc = 1% of supply, claimed = 0.5%, openMC = 100 bnb
		const alloc = TOTAL_SUPPLY / 100n;
		const claimed = TOTAL_SUPPLY / 200n;
		const openMc = 100n * 10n ** 18n;
		const entries = [
			baseEntry(
				{ state: "launched", openMcBnb: openMc.toString() },
				{
					deposited: (5n * 10n ** 17n).toString(), // 0.5 bnb
					totalAllocation: alloc.toString(),
					claimed: claimed.toString(),
				},
			),
		];
		const totals = aggregatePortfolio(entries);
		expect(totals.realizedWei).toBe(5n * 10n ** 17n); // 0.5 bnb implied
		expect(totals.unrealizedWei).toBe(5n * 10n ** 17n); // remaining 0.5%
	});
});
