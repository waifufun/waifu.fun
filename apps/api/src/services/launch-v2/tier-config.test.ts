import assert from "node:assert/strict";
import test from "node:test";

import { getLaunchTierConfigSnapshot } from "./tier-config.js";

const TIER_80_SNAPSHOT = {
	presaleCap: "16000000000000000000",
	quoteAmt: "16000000000000000000",
	v2BuyBnb: "0",
	vestingEnabled: false,
};

test("getLaunchTierConfigSnapshot returns curve-only tier 80 regardless of buy tax", () => {
	assert.deepEqual(getLaunchTierConfigSnapshot("80"), TIER_80_SNAPSHOT);
	assert.deepEqual(getLaunchTierConfigSnapshot("80", 0), TIER_80_SNAPSHOT);
	assert.deepEqual(getLaunchTierConfigSnapshot("80", 1000), TIER_80_SNAPSHOT);
});

test("getLaunchTierConfigSnapshot mirrors hardcoded on-chain TIER_TEST budget", () => {
	const expected = {
		presaleCap: "17340000000000000000",
		quoteAmt: "16840000000000000000",
		v2BuyBnb: "500000000000000000",
		vestingEnabled: false,
	};
	assert.deepEqual(getLaunchTierConfigSnapshot("test"), expected);
	assert.deepEqual(getLaunchTierConfigSnapshot("test", 0), expected);
	assert.deepEqual(getLaunchTierConfigSnapshot("test", 1000), expected);
});

test("getLaunchTierConfigSnapshot computes tier 90 at 3 percent buy tax", () => {
	assert.deepEqual(getLaunchTierConfigSnapshot("90", 300), {
		presaleCap: "32000000000000000000",
		quoteAmt: "16833333333333333334",
		v2BuyBnb: "15166666666666666666",
		vestingEnabled: true,
	});
});

test("getLaunchTierConfigSnapshot computes lower quote amount with zero buy tax", () => {
	const zeroTax = getLaunchTierConfigSnapshot("90", 0);
	const threePercentTax = getLaunchTierConfigSnapshot("90", 300);

	assert.equal(zeroTax.quoteAmt, "16323232323232323233");
	assert.ok(BigInt(zeroTax.quoteAmt) < BigInt(threePercentTax.quoteAmt));
	assert.equal(zeroTax.v2BuyBnb, "15676767676767676767");
});

test("getLaunchTierConfigSnapshot rejects invalid buy tax bps", () => {
	assert.throws(() => getLaunchTierConfigSnapshot("90", 1100), /Invalid tax bps: 1100/);
});

test("getLaunchTierConfigSnapshot computes tier 95 and tier 98 from TierMath formula at 3 percent buy tax", () => {
	assert.deepEqual(getLaunchTierConfigSnapshot("95", 300), {
		presaleCap: "64000000000000000000",
		quoteAmt: "16833333333333333334",
		v2BuyBnb: "47166666666666666666",
		vestingEnabled: true,
	});
	assert.deepEqual(getLaunchTierConfigSnapshot("98", 300), {
		presaleCap: "160000000000000000000",
		quoteAmt: "16833333333333333334",
		v2BuyBnb: "143166666666666666666",
		vestingEnabled: true,
	});
});
