import assert from "node:assert/strict";
import test from "node:test";

import { computePreview } from "./launch-service.js";

test("computePreview returns zero when bnbAmount is zero", () => {
	const result = computePreview({
		bnbAmount: 0n,
		presaleTokens: 200_000_000n * 10n ** 18n,
		totalDeposited: 5n * 10n ** 18n,
	});
	assert.equal(result.tokens, 0n);
	assert.equal(result.share, 0);
	assert.equal(result.projectedValueBnb, 0n);
});

test("computePreview pro-rata with empty pool gives full share", () => {
	const presale = 200n * 10n ** 18n;
	const result = computePreview({
		bnbAmount: 1n * 10n ** 18n,
		presaleTokens: presale,
		totalDeposited: 0n,
	});
	// Sole depositor with 1 BNB, totalDeposited becomes 1 → tokens = presale * 1/1
	assert.equal(result.tokens, presale);
	assert.equal(result.share, 1);
	assert.equal(result.projectedValueBnb, 1n * 10n ** 18n);
});

test("computePreview pro-rata splits the pool by deposit fraction", () => {
	const presale = 200_000_000n * 10n ** 18n;
	const totalDeposited = 9n * 10n ** 18n;
	const myDeposit = 1n * 10n ** 18n;
	const result = computePreview({
		bnbAmount: myDeposit,
		presaleTokens: presale,
		totalDeposited,
	});
	// New total = 10 BNB; my share = 1/10 = 0.1
	assert.equal(result.tokens, presale / 10n);
	assert.equal(Math.round(result.share * 100), 10);
});

test("computePreview is monotonic in bnbAmount", () => {
	const presale = 100n * 10n ** 18n;
	const totalDeposited = 50n * 10n ** 18n;
	const small = computePreview({ bnbAmount: 1n * 10n ** 18n, presaleTokens: presale, totalDeposited });
	const large = computePreview({ bnbAmount: 10n * 10n ** 18n, presaleTokens: presale, totalDeposited });
	assert.ok(large.tokens > small.tokens, "more BNB should buy more tokens");
});
