import assert from "node:assert/strict";
import test from "node:test";

import { bagsAdapter, bankrAdapter, getWaifuLaunchMechanismSnapshot } from "../src/index.js";

const founder = "0x000000000000000000000000000000000000dEaD";

test("bankr builds the documented simulate-only Base deploy request", async () => {
	const feeConfig = bankrAdapter.getDefaultFeeConfig();
	const tx = await bankrAdapter.buildCreateTokenTx({
		name: "Bankr Test",
		ticker: "BNKR",
		description: "test launch",
		logoUrl: "https://example.com/logo.png",
		founderAddress: founder,
		feeConfig,
	});

	assert.equal(tx.chainId, 8453);
	assert.equal(tx.external?.kind, "bankr");
	if (tx.external?.kind !== "bankr") throw new Error("expected bankr external plan");
	assert.equal(tx.external.endpoint, "/token-launches/deploy");
	assert.equal(tx.external.body.tokenName, "Bankr Test");
	assert.equal(tx.external.body.tokenSymbol, "BNKR");
	assert.equal(tx.external.body.simulateOnly, true);
	assert.deepEqual(tx.external.auth, { userHeader: "X-API-Key", partnerHeader: "X-Partner-Key" });
	assert.equal(tx.external.body.feeRecipient.type, "wallet");
	assert.match(tx.external.mockResponse.tokenAddress, /^0x[a-fA-F0-9]{40}$/);
	assert.equal(
		Object.values(tx.external.mockResponse.feeDistribution).reduce((sum, row) => sum + row.bps, 0),
		10_000,
	);
	for (const row of Object.values(tx.external.mockResponse.feeDistribution)) {
		assert.match(row.address, /^0x[a-fA-F0-9]{40}$/);
	}
	assert.equal(tx.external.mockResponse.feeDistribution.creator.bps, 5700);
	assert.equal(tx.external.mockResponse.feeDistribution.partner.bps, 1805);
});

test("bags builds the documented Solana metadata, config, launch transaction, and send flow", async () => {
	const feeConfig = bagsAdapter.getDefaultFeeConfig();
	const tx = await bagsAdapter.buildCreateTokenTx({
		name: "Bags Test",
		ticker: "BAGS",
		description: "test launch",
		logoUrl: "https://example.com/logo.png",
		founderAddress: "So11111111111111111111111111111111111111112",
		feeConfig,
	});

	assert.equal(tx.chainId, 101);
	assert.equal(tx.external?.kind, "bags");
	if (tx.external?.kind !== "bags") throw new Error("expected bags external plan");
	assert.deepEqual(
		tx.external.steps.map((step) => step.endpoint),
		[
			"/token-launch/create-token-info",
			"/fee-share/config",
			"/token-launch/create-launch-transaction",
			"/solana/send-transaction",
		],
	);
	assert.equal(tx.external.steps[0].contentType, "multipart/form-data");
	assert.equal(tx.external.steps[1].body.payer, "So11111111111111111111111111111111111111112");
	assert.equal(tx.external.steps[1].body.baseMint, tx.external.mockResponse.tokenMint);
	assert.deepEqual(tx.external.steps[1].body.basisPointsArray, [9000, 1000]);
	assert.equal(tx.external.steps[2].body.initialBuyLamports, 10_000_000);
	assert.equal(tx.external.steps[2].body.tokenMint, tx.external.mockResponse.tokenMint);
	assert.equal(tx.external.steps[2].body.ipfs, tx.external.mockResponse.tokenMetadata);
	assert.equal(tx.external.steps[3].body.transaction, "<signed-base58-tx>");
	assert.equal(
		tx.external.steps[1].body.basisPointsArray.reduce((sum, bps) => sum + bps, 0),
		10_000,
	);
	assert.deepEqual(tx.external.auth, {
		header: "x-api-key",
		agentAuthEndpoints: ["/agent/v2/auth/init", "/agent/v2/auth/callback"],
	});
	assert.match(tx.external.mockResponse.tokenMint, /^Bag/);
});

test("shared launch mechanism mirrors the current Flap tier economics", () => {
	assert.deepEqual(getWaifuLaunchMechanismSnapshot("95", 300), {
		tier: "95",
		presaleCapWei: "64000000000000000000",
		curveFillWei: "16833333333333333334",
		postGraduationLpWei: "47166666666666666666",
		vestingEnabled: true,
		supplyBps: { presale: 4000, lp: 2000, treasuryReserve: 1000, burn: 3000 },
	});
	assert.deepEqual(getWaifuLaunchMechanismSnapshot("test", 300), {
		tier: "test",
		presaleCapWei: "17340000000000000000",
		curveFillWei: "16840000000000000000",
		postGraduationLpWei: "500000000000000000",
		vestingEnabled: false,
		supplyBps: { presale: 4000, lp: 2000, treasuryReserve: 1000, burn: 3000 },
	});
});
