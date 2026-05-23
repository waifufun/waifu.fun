import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { checkConditionalRules, isBridgeAllowed } from "./allowlist.js";

describe("lifi allowlist", () => {
	it("permits exactly the Phase 2 bridges", () => {
		assert.equal(isBridgeAllowed("across"), true);
		assert.equal(isBridgeAllowed("hyperliquidNative"), true);
		assert.equal(isBridgeAllowed("relaydepository"), true);
		assert.equal(isBridgeAllowed("celercircle"), true);
		assert.equal(isBridgeAllowed("celercirclefast"), true);
		assert.equal(isBridgeAllowed("mayanMCTP"), true);
		assert.equal(isBridgeAllowed("eco"), true);
	});

	it("rejects unknown bridges", () => {
		assert.equal(isBridgeAllowed("symbiosis"), false);
		assert.equal(isBridgeAllowed("multichain"), false);
		assert.equal(isBridgeAllowed(""), false);
		assert.equal(isBridgeAllowed(null), false);
		assert.equal(isBridgeAllowed(undefined), false);
	});

	it("scopes eco to BSC USDT -> Arb USDC only", () => {
		assert.equal(
			checkConditionalRules("eco", {
				fromChain: 56,
				toChain: 42_161,
				fromTokenSymbol: "USDT",
				toTokenSymbol: "USDC",
				estimatedUsd: 100,
			}),
			null,
		);
		assert.equal(
			checkConditionalRules("eco", {
				fromChain: 8_453,
				toChain: 42_161,
				fromTokenSymbol: "USDC",
				toTokenSymbol: "USDC",
				estimatedUsd: 100,
			}),
			"ECO_SCOPE_DENIED",
		);
	});

	it("caps relaydepository at $1000", () => {
		assert.equal(
			checkConditionalRules("relaydepository", {
				fromChain: 42_161,
				toChain: 999,
				fromTokenSymbol: "USDC",
				toTokenSymbol: "USDC",
				estimatedUsd: 500,
			}),
			null,
		);
		assert.equal(
			checkConditionalRules("relaydepository", {
				fromChain: 42_161,
				toChain: 999,
				fromTokenSymbol: "USDC",
				toTokenSymbol: "USDC",
				estimatedUsd: 1_500,
			}),
			"RELAY_CAP_EXCEEDED",
		);
	});

	it("lets unconditional bridges pass without ctx checks", () => {
		assert.equal(
			checkConditionalRules("across", {
				fromChain: 8_453,
				toChain: 42_161,
				fromTokenSymbol: "USDC",
				toTokenSymbol: "USDC",
				estimatedUsd: 50,
			}),
			null,
		);
	});
});
