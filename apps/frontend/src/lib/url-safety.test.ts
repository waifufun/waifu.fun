import { describe, expect, it } from "vitest";
import { getSocialLinkEntries, sanitizeExternalUrl, sanitizeRedirectPath, sanitizeSocialLinks } from "./url-safety";

describe("url safety helpers", () => {
	it("keeps http and https external links", () => {
		expect(sanitizeExternalUrl("https://x.com/waifudotfun")).toBe("https://x.com/waifudotfun");
		expect(sanitizeExternalUrl("http://example.com/path?q=1")).toBe("http://example.com/path?q=1");
	});

	it("drops scriptable and non-url external links", () => {
		expect(sanitizeExternalUrl("javascript:alert(document.domain)")).toBeNull();
		expect(sanitizeExternalUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
		expect(sanitizeExternalUrl(" @waifudotfun ")).toBeNull();
		expect(sanitizeExternalUrl("https://x.com/waifu\njavascript:alert(1)")).toBeNull();
	});

	it("filters unsafe social links while preserving safe ones", () => {
		expect(
			sanitizeSocialLinks({
				twitter: "javascript:alert(1)",
				telegram: "https://t.me/waifu",
				discord: "data:text/html,<h1>owned</h1>",
				website: "https://waifu.fun",
			}),
		).toEqual({
			telegram: "https://t.me/waifu",
			website: "https://waifu.fun/",
		});
	});

	it("classifies invalid social links for text-only rendering", () => {
		expect(
			getSocialLinkEntries({
				twitter: "javascript:alert(1)",
				telegram: "https://t.me/waifu",
			}),
		).toEqual([
			{ key: "twitter", label: "Twitter", value: "javascript:alert(1)", href: null },
			{ key: "telegram", label: "Telegram", value: "https://t.me/waifu", href: "https://t.me/waifu" },
		]);
	});

	it("keeps same-origin relative post-auth redirects", () => {
		expect(sanitizeRedirectPath("/patron/wallets?tab=main#top")).toBe("/patron/wallets?tab=main#top");
	});

	it("falls back for open redirect and scriptable post-auth targets", () => {
		for (const target of [
			"https://evil.test/patron",
			"//evil.test/patron",
			"/\\evil.test",
			"/foo\\bar",
			"/%2fevil.test",
			"/%2Fevil.test",
			"/%5cevil.test",
			"/%5Cevil.test",
			"javascript:alert(1)",
			"data:text/html,<h1>owned</h1>",
		]) {
			expect(sanitizeRedirectPath(target)).toBe("/patron");
		}
	});
});
