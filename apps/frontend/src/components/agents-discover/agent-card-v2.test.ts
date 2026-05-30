import { describe, expect, it } from "vitest";

import {
	formatNumberShort,
	formatPercentShort,
	formatUsdShort,
	resolveTierId,
	shortAddress,
	tierDisplay,
} from "./agent-card-v2.helpers";

describe("agent-card-v2 helpers", () => {
	describe("shortAddress", () => {
		it("truncates a full evm address to 0x1234...5678", () => {
			expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234...5678");
		});
		it("returns short input unchanged", () => {
			expect(shortAddress("0xabc")).toBe("0xabc");
		});
		it("handles empty input", () => {
			expect(shortAddress("")).toBe("");
		});
	});

	describe("tierDisplay", () => {
		it("returns SMOL for tier 80", () => {
			expect(tierDisplay(80)?.name).toBe("SMOL");
		});
		it("returns BASED for tier 90", () => {
			expect(tierDisplay(90)?.name).toBe("BASED");
		});
		it("returns WAGMI for tier 95", () => {
			expect(tierDisplay(95)?.name).toBe("WAGMI");
		});
		it("returns GIGACHAD with accent tone for tier 98", () => {
			const t = tierDisplay(98);
			expect(t?.name).toBe("GIGACHAD");
			expect(t?.tone).toContain("#00ff87");
		});
		it("returns null for null / undefined / unknown tier", () => {
			expect(tierDisplay(null)).toBeNull();
			expect(tierDisplay(undefined)).toBeNull();
			expect(tierDisplay(7)).toBeNull();
		});
	});

	describe("formatUsdShort", () => {
		it("returns middot for non-positive / non-finite", () => {
			expect(formatUsdShort(0)).toBe("·");
			expect(formatUsdShort(-1)).toBe("·");
			expect(formatUsdShort(Number.NaN)).toBe("·");
		});
		it("formats billions with b suffix", () => {
			expect(formatUsdShort(2_500_000_000)).toBe("$2.50b");
		});
		it("formats millions with m suffix", () => {
			expect(formatUsdShort(1_750_000)).toBe("$1.75m");
		});
		it("formats thousands with k suffix", () => {
			expect(formatUsdShort(12_400)).toBe("$12.4k");
		});
		it("formats sub-1k without suffix", () => {
			expect(formatUsdShort(420)).toBe("$420");
		});
	});

	describe("formatNumberShort", () => {
		it("preserves zero", () => {
			expect(formatNumberShort(0)).toBe("0");
		});
		it("returns middot for negative / non-finite", () => {
			expect(formatNumberShort(-3)).toBe("·");
			expect(formatNumberShort(Number.NaN)).toBe("·");
		});
		it("formats millions / thousands compactly", () => {
			expect(formatNumberShort(2_300_000)).toBe("2.3m");
			expect(formatNumberShort(4_500)).toBe("4.5k");
		});
	});

	describe("formatPercentShort", () => {
		it("formats signed percentages compactly", () => {
			expect(formatPercentShort(12.345)).toBe("+12.3%");
			expect(formatPercentShort(-1.234)).toBe("-1.23%");
			expect(formatPercentShort(0)).toBe("0.00%");
		});
	});

	describe("resolveTierId", () => {
		it("maps API string labels to numeric tier ids", () => {
			expect(resolveTierId("TIER_80")).toBe(80);
			expect(resolveTierId("TIER_90")).toBe(90);
			expect(resolveTierId("TIER_95")).toBe(95);
			expect(resolveTierId("TIER_98")).toBe(98);
		});
		it("keeps direct numeric tier ids 80/90/95/98 intact", () => {
			expect(resolveTierId(80)).toBe(80);
			expect(resolveTierId(95)).toBe(95);
		});
		it("returns null for on-chain enum index numbers (0..4)", () => {
			// 0..4 are the on-chain agent_launches.tier enum indices but not
			// what tierDisplay() consumes; resolveTierId returns null so we
			// surface no badge rather than the wrong one.
			expect(resolveTierId(0)).toBeNull();
			expect(resolveTierId(2)).toBeNull();
		});
		it("accepts display labels (SMOL / WAGMI)", () => {
			expect(resolveTierId("WAGMI")).toBe(95);
			expect(resolveTierId("SMOL")).toBe(80);
			expect(resolveTierId("GIGACHAD")).toBe(98);
		});
		it("returns null for null / undefined / unknown", () => {
			expect(resolveTierId(null)).toBeNull();
			expect(resolveTierId(undefined)).toBeNull();
			expect(resolveTierId("")).toBeNull();
			expect(resolveTierId("NOT_A_TIER")).toBeNull();
		});
	});
});
