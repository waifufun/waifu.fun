import { describe, expect, it } from "vitest";
import { TIERS, getTier, tierLabel, totalBnb } from "./tier-data";

describe("tier-data", () => {
	it("exposes the four spec'd tiers in ascending order", () => {
		expect(TIERS.map((t) => t.id)).toEqual([80, 90, 95, 98]);
	});

	it("totalBnb sums cap + v2Buy", () => {
		expect(totalBnb(TIERS[0]!)).toBe(16); // 16 + 0
		expect(totalBnb(TIERS[1]!)).toBe(48); // 32 + 16
		expect(totalBnb(TIERS[2]!)).toBe(112); // 64 + 48
		expect(totalBnb(TIERS[3]!)).toBe(304); // 160 + 144
	});

	it("getTier is a no-op on null/missing ids", () => {
		expect(getTier(null)).toBeNull();
		expect(getTier(undefined)).toBeNull();
	});

	it("getTier resolves a known tier", () => {
		const t = getTier(90);
		expect(t).not.toBeNull();
		expect(t?.openMc).toBe(320);
		expect(t?.presaler).toBe(2.0);
		expect(t?.burn).toBe(60);
		expect(t?.vesting).toBe("50/50/24h");
	});

	it("tier 80 has no vesting (legacy preset)", () => {
		expect(getTier(80)?.vesting).toBe("none");
	});

	it("tierLabel is `tier_<id>`", () => {
		expect(tierLabel(80)).toBe("tier_80");
		expect(tierLabel(98)).toBe("tier_98");
	});
});
