import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeAuthReturnTo } from "./redirect-safety.js";

describe("sanitizeAuthReturnTo", () => {
	it("keeps normalized same-origin paths", () => {
		assert.equal(sanitizeAuthReturnTo("/patron/wallets?tab=main#top"), "/patron/wallets?tab=main#top");
	});

	it("rejects open-redirect slash and backslash variants", () => {
		for (const target of [
			"https://evil.example/patron",
			"//evil.example/patron",
			"/\\evil.example/patron",
			"/foo\\bar",
			"/%2fevil.example/patron",
			"/%2Fevil.example/patron",
			"/%5cevil.example/patron",
			"/%5Cevil.example/patron",
		]) {
			assert.equal(sanitizeAuthReturnTo(target), null, target);
		}
	});

	it("rejects whitespace and control-character redirects", () => {
		for (const target of ["/patron\n//evil.example", "/patron\twallets", " /patron", "/patron "]) {
			assert.equal(sanitizeAuthReturnTo(target), null, target);
		}
	});
});
