// Test set adapted from Motion+ source (motion-plus@2.11.3).

import { describe, expect, it } from "vitest";

import { formatToParts } from "./format-parts";

describe("formatToParts", () => {
	it("splits a simple integer into digit parts keyed RTL", () => {
		const result = formatToParts(123, {});
		expect(result.integer).toHaveLength(3);
		expect(result.integer.map((p) => p.value)).toEqual([1, 2, 3]);
		const keys = result.integer.map((p) => p.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("returns the formatted string", () => {
		const result = formatToParts(1234, { locales: "en-US" });
		expect(result.formatted).toBe("1,234");
	});

	it("handles zero", () => {
		const result = formatToParts(0, {});
		expect(result.integer).toHaveLength(1);
		expect(result.integer[0]?.value).toBe(0);
	});

	it("handles negative numbers with a sign part", () => {
		const result = formatToParts(-42, { locales: "en-US" });
		const signParts = result.pre.filter((p) => p.type === "sign");
		expect(signParts.length).toBeGreaterThanOrEqual(1);
		expect(result.integer.map((p) => p.value)).toEqual([4, 2]);
	});

	it("splits decimals into fraction parts", () => {
		const result = formatToParts(3.14, {
			format: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
		});
		const decimalParts = result.fraction.filter((p) => p.type === "decimal");
		expect(decimalParts).toHaveLength(1);
		const fractionDigits = result.fraction.filter((p) => p.type === "fraction");
		expect(fractionDigits.map((p) => p.value)).toEqual([1, 4]);
	});

	it("handles group separators in large numbers", () => {
		const result = formatToParts(1_000_000, { locales: "en-US" });
		const groupParts = result.integer.filter((p) => p.type === "group");
		expect(groupParts.length).toBeGreaterThanOrEqual(1);
		expect(groupParts[0]?.value).toBe(",");
	});

	it("adds prefix to pre section", () => {
		const result = formatToParts(100, {}, "~");
		const prefixParts = result.pre.filter((p) => p.type === "prefix");
		expect(prefixParts).toHaveLength(1);
		expect(prefixParts[0]?.value).toBe("~");
		expect(result.formatted).toContain("~");
	});

	it("adds suffix to post section", () => {
		const result = formatToParts(100, {}, undefined, "/mo");
		const suffixParts = result.post.filter((p) => p.type === "suffix");
		expect(suffixParts).toHaveLength(1);
		expect(suffixParts[0]?.value).toBe("/mo");
		expect(result.formatted).toContain("/mo");
	});

	it("adds both prefix and suffix", () => {
		const result = formatToParts(50, {}, "~", "%");
		expect(result.pre.some((p) => p.type === "prefix")).toBe(true);
		expect(result.post.some((p) => p.type === "suffix")).toBe(true);
		expect(result.formatted).toBe("~50%");
	});

	it("handles currency formatting", () => {
		const result = formatToParts(9.99, {
			locales: "en-US",
			format: { style: "currency", currency: "USD" },
		});
		const currencyParts = result.pre.filter((p) => p.type === "currency");
		expect(currencyParts.length).toBeGreaterThanOrEqual(1);
		expect(result.formatted).toContain("$");
	});

	it("handles string input", () => {
		const result = formatToParts("42", {});
		expect(result.integer.map((p) => p.value)).toEqual([4, 2]);
	});

	it("handles bigint input", () => {
		const result = formatToParts(BigInt(999), {});
		expect(result.integer.map((p) => p.value)).toEqual([9, 9, 9]);
	});

	it("produces unique keys across all sections", () => {
		const result = formatToParts(-1234.56, {
			locales: "en-US",
			format: { minimumFractionDigits: 2 },
		});
		const allKeys = [
			...result.pre.map((p) => p.key),
			...result.integer.map((p) => p.key),
			...result.fraction.map((p) => p.key),
			...result.post.map((p) => p.key),
		];
		expect(new Set(allKeys).size).toBe(allKeys.length);
	});

	it("integer keys are assigned RTL for stable layout across magnitudes", () => {
		// 99 → 100: the ones-digit slot should keep the same key so it
		// animates in place instead of being recreated when a tens digit
		// is appended on the left.
		const result99 = formatToParts(99, {});
		const result100 = formatToParts(100, {});

		const lastKey99 = result99.integer[result99.integer.length - 1]?.key;
		const lastKey100 = result100.integer[result100.integer.length - 1]?.key;
		expect(lastKey99).toBe(lastKey100);
	});
});
