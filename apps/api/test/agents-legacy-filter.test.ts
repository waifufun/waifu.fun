import assert from "node:assert/strict";
import test from "node:test";

import { parseIncludeLegacy } from "../src/routes/v2/agents.js";

test("includeLegacy query flag is opt-in only", () => {
	assert.equal(parseIncludeLegacy(undefined), false);
	assert.equal(parseIncludeLegacy("false"), false);
	assert.equal(parseIncludeLegacy("1"), false);
	assert.equal(parseIncludeLegacy("true"), true);
});
