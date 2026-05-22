import assert from "node:assert/strict";
import test from "node:test";

import {
	DEFAULT_PLATFORM_CUT_BPS,
	createFourMemeTaxTokenAdapter,
	fourMemeTaxTokenAdapter,
	toFourMemeTokenTaxInfo,
} from "../src/index.js";
import type { FourMemeTaxFeeConfig } from "../src/types.js";

const validConfig = (overrides: Partial<FourMemeTaxFeeConfig> = {}): FourMemeTaxFeeConfig => {
	const platformCutBps = overrides.platformCutBps ?? DEFAULT_PLATFORM_CUT_BPS;
	const remaining = 10000 - platformCutBps;
	return {
		kind: "four-meme-tax",
		taxBps: 300,
		platformCutBps,
		allocation: {
			founderBps: remaining,
			holderBps: 0,
			burnBps: 0,
			liquidityBps: 0,
		},
		minHolderBalance: "1000000000000000000",
		...overrides,
	};
};

test("four.meme tax exposes a prod-valid default config", () => {
	const config = fourMemeTaxTokenAdapter.getDefaultFeeConfig();
	assert.equal(config.kind, "four-meme-tax");
	assert.equal(config.platformCutBps, DEFAULT_PLATFORM_CUT_BPS);
	const total =
		config.allocation.founderBps +
		config.allocation.holderBps +
		config.allocation.burnBps +
		config.allocation.liquidityBps;
	assert.equal(total, 10000 - DEFAULT_PLATFORM_CUT_BPS);
	assert.deepEqual(fourMemeTaxTokenAdapter.validateFeeConfig(config, "prod"), {
		ok: true,
		errors: [],
	});
});

test("four.meme tax requires tax bps from allowed set", () => {
	const result = fourMemeTaxTokenAdapter.validateFeeConfig(
		validConfig({ taxBps: 200 as FourMemeTaxFeeConfig["taxBps"] }),
		"dev",
	);
	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /taxBps must be one of 100, 300, 500, 1000/);
});

test("four.meme tax requires allocation to sum to (10000 - platformCutBps)", () => {
	const config = validConfig();
	// perturb so allocation sums to expected - 1000
	config.allocation = { founderBps: 1000, holderBps: 1000, burnBps: 1000, liquidityBps: 1500 };
	const result = fourMemeTaxTokenAdapter.validateFeeConfig(config, "dev");
	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /allocation bps must sum to \d+ \(10000 - platformCutBps\)/);
});

test("four.meme tax enforces platformCutBps bounds in prod", () => {
	// below min (10%)
	const tooLow = validConfig({ platformCutBps: 500 });
	// need allocation to match
	tooLow.allocation = { founderBps: 9500, holderBps: 0, burnBps: 0, liquidityBps: 0 };
	const lowResult = fourMemeTaxTokenAdapter.validateFeeConfig(tooLow, "prod");
	assert.equal(lowResult.ok, false);
	assert.match(lowResult.errors.join("\n"), /platformCutBps must be at least 1000/);

	// above max (50%)
	const tooHigh = validConfig({ platformCutBps: 6000 });
	tooHigh.allocation = { founderBps: 4000, holderBps: 0, burnBps: 0, liquidityBps: 0 };
	const highResult = fourMemeTaxTokenAdapter.validateFeeConfig(tooHigh, "prod");
	assert.equal(highResult.ok, false);
	assert.match(highResult.errors.join("\n"), /platformCutBps must be at most 5000/);
});

test("four.meme tax skips platformCutBps bound enforcement in dev", () => {
	const config = validConfig({ platformCutBps: 500 });
	config.allocation = { founderBps: 9500, holderBps: 0, burnBps: 0, liquidityBps: 0 };
	const result = fourMemeTaxTokenAdapter.validateFeeConfig(config, "dev");
	assert.deepEqual(result, { ok: true, errors: [] });
});

test("four.meme tax allows creator to allocate full split however they want", () => {
	// 25% platform cut -> 75% remaining, all rates serialize to whole percents.
	const config: FourMemeTaxFeeConfig = {
		kind: "four-meme-tax",
		taxBps: 300,
		platformCutBps: 2500,
		allocation: { founderBps: 3500, holderBps: 2000, burnBps: 1000, liquidityBps: 1000 },
		minHolderBalance: "0",
	};
	assert.deepEqual(fourMemeTaxTokenAdapter.validateFeeConfig(config, "prod"), {
		ok: true,
		errors: [],
	});
});

test("toFourMemeTokenTaxInfo merges platformCutBps into on-chain founder rate", () => {
	const config: FourMemeTaxFeeConfig = {
		kind: "four-meme-tax",
		taxBps: 300,
		platformCutBps: 2500,
		allocation: { founderBps: 3500, holderBps: 2000, burnBps: 1000, liquidityBps: 1000 },
		minHolderBalance: "0",
	};
	const info = toFourMemeTokenTaxInfo(config, "0x1111111111111111111111111111111111111111");
	// on-chain founder = creator's founder allocation + platform cut
	// 3500 + 2500 = 6000 bps = 60
	assert.equal(info.recipientRate, 60);
	assert.equal(info.divideRate, 20);
	assert.equal(info.burnRate, 10);
	assert.equal(info.liquidityRate, 10);
	// sums to 100
	assert.equal(info.recipientRate + info.divideRate + info.burnRate + info.liquidityRate, 100);
});

test("four.meme tax rejects bps that would serialize to fractional API rates", () => {
	const config: FourMemeTaxFeeConfig = {
		kind: "four-meme-tax",
		taxBps: 300,
		platformCutBps: 1000,
		allocation: { founderBps: 3333, holderBps: 3333, burnBps: 2333, liquidityBps: 1 },
		minHolderBalance: "0",
	};
	const result = fourMemeTaxTokenAdapter.validateFeeConfig(config, "prod");
	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /whole percent/);
});

test("four.meme tax adapter passes client through to inherited read methods", async () => {
	const adapter = createFourMemeTaxTokenAdapter({} as never);
	await assert.rejects(
		() => adapter.getTradeFeeBps("0x1111111111111111111111111111111111111111", "curve"),
		/(readContract|client|function)/i,
	);
});
