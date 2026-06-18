/**
 * Tests for Hyperliquid asset logo resolution (symbol/ticker based).
 *
 * HL exposes no logo field, so these assets resolve by ticker, not by
 * chain:address like ERC-20s. We exercise:
 *   - ticker normalization (xyz: prefix strip, uppercasing)
 *   - equity vs crypto classification
 *   - the resolution cascade (manifest SVG > coingecko-by-id > logo.dev)
 *   - graceful degradation when no logo.dev token is set (equity -> null ->
 *     monogram in the component)
 *
 * Network is mocked; no real fetches leave the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearTokenLogoCache, hlTicker, isHlEquity, resolveHlAssetLogo } from "./token-logo";

describe("hlTicker", () => {
	it("strips the xyz: builder-dex prefix", () => {
		expect(hlTicker("xyz:SPCX")).toBe("SPCX");
		expect(hlTicker("xyz:AAPL")).toBe("AAPL");
	});

	it("uppercases and trims bare coins", () => {
		expect(hlTicker("btc")).toBe("BTC");
		expect(hlTicker("  eth ")).toBe("ETH");
	});

	it("handles already-clean tickers", () => {
		expect(hlTicker("HYPE")).toBe("HYPE");
	});

	it("strips any single dex prefix, not just xyz", () => {
		expect(hlTicker("foo:TSLA")).toBe("TSLA");
	});

	it("is empty-safe", () => {
		expect(hlTicker("")).toBe("");
	});
});

describe("isHlEquity", () => {
	it("classifies xyz: synthetic equities as equities", () => {
		expect(isHlEquity("xyz:SPCX")).toBe(true);
		expect(isHlEquity("xyz:AAPL")).toBe(true);
		expect(isHlEquity("xyz:TSLA")).toBe(true);
		expect(isHlEquity("xyz:NVDA")).toBe(true);
	});

	it("classifies core crypto coins as NOT equities", () => {
		expect(isHlEquity("BTC")).toBe(false);
		expect(isHlEquity("ETH")).toBe(false);
		expect(isHlEquity("SOL")).toBe(false);
		expect(isHlEquity("HYPE")).toBe(false);
		expect(isHlEquity("NEAR")).toBe(false);
	});

	it("treats a known coin as crypto even with a dex prefix", () => {
		expect(isHlEquity("xyz:BTC")).toBe(false);
	});

	it("treats an unknown bare ticker as an equity", () => {
		expect(isHlEquity("HOOD")).toBe(true);
	});
});

describe("resolveHlAssetLogo", () => {
	const originalToken = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

	beforeEach(() => {
		clearTokenLogoCache();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		if (originalToken === undefined) delete process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
		else process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN = originalToken;
		vi.restoreAllMocks();
	});

	it("resolves common coins to their local manifest SVG (no network)", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		await expect(resolveHlAssetLogo("BTC")).resolves.toBe("/token-logos/btc.svg");
		await expect(resolveHlAssetLogo("xyz:ETH")).resolves.toBe("/token-logos/eth.svg");
		await expect(resolveHlAssetLogo("HYPE")).resolves.toBe("/token-logos/hype.svg");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("resolves a coingecko-mapped coin without a local SVG via coingecko", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ image: { large: "https://cg/avax.png" } }), { status: 200 }),
		);
		await expect(resolveHlAssetLogo("AVAX")).resolves.toBe("https://cg/avax.png");
	});

	it("returns null (monogram fallback) for an equity when no logo.dev token is set", async () => {
		delete process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		// TSLA has no local manifest SVG, so it falls through to the logo.dev
		// branch — which returns null without a token. (SPCX now ships a hand
		// vector in token-logos.json, so it would resolve via the manifest.)
		await expect(resolveHlAssetLogo("xyz:TSLA")).resolves.toBeNull();
		// no token => no logo.dev request at all (it would 401), just monogram
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("builds a logo.dev URL for an equity when a token IS set", async () => {
		process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN = "pk_test123";
		const url = await resolveHlAssetLogo("xyz:AAPL");
		expect(url).toContain("https://img.logo.dev/ticker/AAPL");
		expect(url).toContain("token=pk_test123");
		expect(url).toContain("format=png");
	});

	it("caches per ticker (second call does not refetch)", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ image: { large: "https://cg/arb.png" } }), { status: 200 }));
		await resolveHlAssetLogo("ARB");
		await resolveHlAssetLogo("ARB");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("is empty-safe", async () => {
		await expect(resolveHlAssetLogo("")).resolves.toBeNull();
	});
});
