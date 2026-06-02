import assert from "node:assert/strict";
import test from "node:test";

import { getEscrowThresholdUsd, getSettlementMode, isSettlementMode } from "./settlement.js";

test("getSettlementMode defaults to credits for absent or invalid metadata", () => {
	assert.equal(getSettlementMode(null), "credits");
	assert.equal(getSettlementMode(undefined), "credits");
	assert.equal(getSettlementMode({}), "credits");
	assert.equal(getSettlementMode({ settlementMode: "wire" }), "credits");
	assert.equal(getSettlementMode({ settlement: "escrow" }), "credits");
});

test("getSettlementMode parses the normalized metadata.settlementMode manifest", () => {
	assert.equal(getSettlementMode({ settlementMode: "credits" }), "credits");
	assert.equal(getSettlementMode({ settlementMode: "escrow" }), "escrow");
	assert.equal(getSettlementMode({ settlementMode: "auto" }), "auto");
	assert.equal(isSettlementMode("escrow"), true);
	assert.equal(isSettlementMode("cash"), false);
});

test("getEscrowThresholdUsd reads numeric overrides and defaults invalid values", () => {
	assert.equal(getEscrowThresholdUsd({ escrowThresholdUsd: "2.5" }, 1), 2.5);
	assert.equal(getEscrowThresholdUsd({ escrowThresholdUsd: -1 }, 1), 1);
	assert.equal(getEscrowThresholdUsd({}, 1), 1);
});
