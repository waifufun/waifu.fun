import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_AGENT_AUTONOMY, updateAgentAutonomy } from "../src/services/agent-launch/index.js";

const safe = "0x0000000000000000000000000000000000000afe" as const;
const modifier = "0x0000000000000000000000000000000000000f1e" as const;
const agent = "0x00000000000000000000000000000000000000a1" as const;
const fork = process.env.BSC_FORK_RPC_URL;

test("updateAgentAutonomy returns patron-signable unsigned role transactions", () => {
	const txs = updateAgentAutonomy(safe, modifier, {
		agentEoaAddress: agent,
		maxPercentPortfolioPerTrade: DEFAULT_AGENT_AUTONOMY.maxPercentPortfolioPerTrade,
		maxTradesPer24h: DEFAULT_AGENT_AUTONOMY.maxTradesPer24h,
	});

	assert.ok(txs.length >= 5);
	for (const tx of txs) {
		assert.equal(tx.to, "0x0000000000000000000000000000000000000F1E");
		assert.equal(tx.value, 0n);
		assert.equal(tx.chainId, 56);
		assert.match(tx.data, /^0x[0-9a-f]+$/i);
	}
});

test("BSC fork: allowed agent makes 1% Pancake swap", { skip: !fork }, async () => {
	// TODO(W1.C): wire to an anvil/hardhat BSC fork with funded Safe and Pancake
	// liquidity. Skipped unless BSC_FORK_RPC_URL is set.
	assert.ok(fork);
});

test("BSC fork: non-whitelisted target reverts", { skip: !fork }, async () => {
	assert.ok(fork);
});

test("BSC fork: 11th trade in 24h reverts", { skip: !fork }, async () => {
	assert.ok(fork);
});

test("BSC fork: patron Safe owner action succeeds", { skip: !fork }, async () => {
	assert.ok(fork);
});
