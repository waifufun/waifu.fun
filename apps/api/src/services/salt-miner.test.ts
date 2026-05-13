import assert from "node:assert/strict";
import test from "node:test";

import { mineVanitySalt, predictFlapTokenAddress } from "./salt-miner.js";

test("mineVanitySalt is deterministic for a fixed seed", () => {
	const first = mineVanitySalt({ seed: "0x01", suffix: "77", maxIterations: 100_000 });
	const second = mineVanitySalt({ seed: "0x01", suffix: "77", maxIterations: 100_000 });
	assert.deepEqual(second, first);
	assert.ok(first.predictedTokenAddress.endsWith("77"));
	assert.equal(predictFlapTokenAddress({ salt: first.salt }), first.predictedTokenAddress);
});
