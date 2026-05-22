import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { optionalUrlSchema } from "./common.js";

describe("optionalUrlSchema", () => {
	it("accepts http and https URLs", () => {
		assert.equal(optionalUrlSchema.parse("https://waifu.fun/agent"), "https://waifu.fun/agent");
		assert.equal(optionalUrlSchema.parse("http://example.com/path"), "http://example.com/path");
	});

	it("rejects scriptable URL schemes", () => {
		for (const value of ["javascript:alert(document.domain)", "data:text/html,<script>alert(1)</script>"]) {
			assert.equal(optionalUrlSchema.safeParse(value).success, false);
		}
	});

	it("treats empty strings as omitted optional URLs", () => {
		assert.equal(optionalUrlSchema.parse(""), undefined);
		assert.equal(optionalUrlSchema.parse("   "), undefined);
	});
});
