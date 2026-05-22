import { describe, expect, it } from "vitest";

import { formatNumberShort, formatUsdShort, shortAddress, tierDisplay } from "./agent-card-v2.helpers";

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
		it("returns dash for non-positive / non-finite", () => {
			expect(formatUsdShort(0)).toBe("–");
			expect(formatUsdShort(-1)).toBe("–");
			expect(formatUsdShort(Number.NaN)).toBe("–");
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
		it("returns dash for negative / non-finite", () => {
			expect(formatNumberShort(-3)).toBe("–");
			expect(formatNumberShort(Number.NaN)).toBe("–");
		});
		it("formats millions / thousands compactly", () => {
			expect(formatNumberShort(2_300_000)).toBe("2.3m");
			expect(formatNumberShort(4_500)).toBe("4.5k");
		});
	});
});
