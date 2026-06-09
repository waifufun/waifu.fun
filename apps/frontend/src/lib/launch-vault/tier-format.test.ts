import { describe, expect, it } from "vitest";

import { BNB_USD_FALLBACK, formatUsdMarketCap, getTier, marketCapUsd } from "@/components/create/tier/tier-data";
import { LAUNCH_TIERS, tierFromCapWei, tierFromString } from "./tiers";

describe("tier market-cap formatting", () => {
	it("keeps circulating market cap and FDV visible for every v3 tier", () => {
		expect(LAUNCH_TIERS.TIER_80.openCircMcUsdHint).toContain("circulating mc");
		expect(LAUNCH_TIERS.TIER_80.openFdvUsdHint).toContain("fdv");
		expect(LAUNCH_TIERS.TIER_98.openCircMcUsdHint).toContain("circulating mc");
		expect(LAUNCH_TIERS.TIER_98.openFdvUsdHint).toContain("fdv");
	});

	it("converts BNB to USD using the $635 fallback", () => {
		expect(BNB_USD_FALLBACK).toBe(635);
		expect(marketCapUsd(128)).toBe(81_280);
		expect(formatUsdMarketCap(128)).toBe("$81k");
		expect(formatUsdMarketCap(2560)).toBe("$1.6m");
	});

	it("maps cap and tier strings to canonical tier metadata", () => {
		expect(tierFromString("tier 95")?.id).toBe("TIER_95");
		expect(tierFromString("TIER_98")?.presaleCapBnb).toBe(160);
		expect(tierFromString("TIER_TEST")?.presaleCapBnb).toBe(0.1);
		expect(tierFromCapWei(64n * 10n ** 18n).id).toBe("TIER_95");
		expect(tierFromCapWei(100_000_000_000_000_000n).id).toBe("TIER_TEST");
		expect(getTier(90)?.circulatingSupplyM).toBe(400);
	});
});
