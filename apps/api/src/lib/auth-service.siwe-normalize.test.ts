import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeHexSignature } from "./auth-service.js";

describe("normalizeHexSignature", () => {
	it("collapses a doubled 0x0x prefix to a single 0x", () => {
		assert.equal(
			normalizeHexSignature("0x0xabcdef"),
			"0xabcdef",
		);
	});

	it("leaves a single 0x-prefixed signature unchanged", () => {
		assert.equal(normalizeHexSignature("0xabcdef"), "0xabcdef");
	});

	it("collapses multiple repeated 0x prefixes", () => {
		assert.equal(normalizeHexSignature("0x0x0xff"), "0xff");
	});

	it("trims whitespace and adds a missing 0x prefix", () => {
		assert.equal(normalizeHexSignature("  0x0xAA  "), "0xAA");
		assert.equal(normalizeHexSignature("abcd"), "0xabcd");
	});
});
