import assert from "node:assert/strict";
import test from "node:test";

import { fourMemeRegularAdapter } from "../src/index.js";

test("four.meme regular exposes fixed default config", () => {
	assert.deepEqual(fourMemeRegularAdapter.getDefaultFeeConfig(), { kind: "four-meme-regular" });
});

test("four.meme regular validates only regular configs", () => {
	assert.deepEqual(fourMemeRegularAdapter.validateFeeConfig({ kind: "four-meme-regular" }, "prod"), {
		ok: true,
		errors: [],
	});
	assert.deepEqual(
		fourMemeRegularAdapter.validateFeeConfig(
			{
				kind: "four-meme-tax",
				taxBps: 300,
				allocation: { founderBps: 2500, holderBps: 2500, burnBps: 2500, liquidityBps: 2500 },
				minHolderBalance: "0",
			},
			"prod",
		),
		{ ok: false, errors: ["feeConfig.kind must be four-meme-regular"] },
	);
});
