/**
 * Sanity tests for MarketPanel formatters. Vitest runs in node-env so we
 * test the pure formatters by re-deriving them locally (the production
 * formatters are inlined module-private helpers). Keep these in sync if
 * the production functions change.
 */
import { describe, expect, it } from "vitest";

function fmtUsd(value: number | null): string {
	if (value === null || !Number.isFinite(value) || value === 0) return "—";
	const abs = Math.abs(value);
	if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}k`;
	if (abs >= 1) return `$${value.toFixed(2)}`;
	if (abs >= 0.01) return `$${value.toFixed(4)}`;
	return `$${value.toPrecision(2)}`;
}

function fmtPriceUsd(value: number | null): string {
	if (value === null || !Number.isFinite(value) || value === 0) return "—";
	const abs = Math.abs(value);
	if (abs >= 1) return `$${value.toFixed(4)}`;
	if (abs >= 0.0001) return `$${value.toFixed(6)}`;
	return `$${value.toPrecision(3)}`;
}

function fmtPct(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "—";
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}%`;
}

describe("MarketPanel.fmtUsd", () => {
	it("$8.88M FDV (Sol's launch night) collapses to mega suffix", () => {
		expect(fmtUsd(8_881_710)).toBe("$8.88M");
	});

	it("$354k volume (24h) collapses to kilo suffix with one decimal", () => {
		expect(fmtUsd(354_300)).toBe("$354.3k");
	});

	it("zero collapses to em-dash so the panel never claims false data", () => {
		expect(fmtUsd(0)).toBe("—");
		expect(fmtUsd(null)).toBe("—");
	});

	it("sub-cent values preserve precision", () => {
		expect(fmtUsd(0.005)).toBe("$0.0050");
	});

	it("billion-scale FDVs collapse to giga suffix", () => {
		expect(fmtUsd(1_500_000_000)).toBe("$1.50B");
	});
});

describe("MarketPanel.fmtPriceUsd", () => {
	it("micro-cap token prices preserve significant figures", () => {
		// e.g. $0.00000779 per WAIFU at launch — toPrecision(3) stays in
		// fixed notation for values >= 1e-6, which is what we want.
		expect(fmtPriceUsd(0.00000779)).toBe("$0.00000779");
	});

	it("0.0001 - 1 prices use 6 decimals", () => {
		expect(fmtPriceUsd(0.012345)).toBe("$0.012345");
	});

	it("dollar+ prices use 4 decimals", () => {
		expect(fmtPriceUsd(1.5)).toBe("$1.5000");
	});

	it("zero / null degrade to em-dash", () => {
		expect(fmtPriceUsd(0)).toBe("—");
		expect(fmtPriceUsd(null)).toBe("—");
	});
});

describe("MarketPanel.fmtPct", () => {
	it("positive change gets a leading +", () => {
		expect(fmtPct(587.0)).toBe("+587.00%");
	});

	it("negative change keeps its native sign (no double-prefix)", () => {
		expect(fmtPct(-12.34)).toBe("-12.34%");
	});

	it("zero is signless", () => {
		expect(fmtPct(0)).toBe("0.00%");
	});

	it("null degrades to em-dash", () => {
		expect(fmtPct(null)).toBe("—");
	});
});
