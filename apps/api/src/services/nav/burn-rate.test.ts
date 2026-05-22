import assert from "node:assert/strict";
import test from "node:test";

import type { AgentWallet } from "@waifufun/types";

import { __resetBurnRateDepsForTest, __setBurnRateDepsForTest, computeBurnRate } from "./burn-rate.js";

const AGENT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SAFE = "0x1111111111111111111111111111111111111111";
const HOT = "0x2222222222222222222222222222222222222222";
const PATRON = "0x3333333333333333333333333333333333333333";
const BRIDGE = "0x4444444444444444444444444444444444444444";
const NOW_SECONDS = 2_000_000_000;
const NOW_MS = NOW_SECONDS * 1000;

function wallet(id: string, address: string, role: AgentWallet["role"]): AgentWallet {
	return { id, address, chain: "bsc", role, venue: null, label: id, ownerType: "agent", addedAt: NOW_SECONDS };
}

function wei(bnb: string): string {
	const [whole = "0", frac = ""] = bnb.split(".");
	return `${BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, "0").slice(0, 18) || "0")}`;
}

function ankrResponse(transactions: unknown[]): Response {
	return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { transactions } }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

test.afterEach(() => {
	delete process.env.ANKR_API_KEY;
	delete process.env.BSCSCAN_API_KEY;
	__resetBurnRateDepsForTest();
});

test("computeBurnRate counts outgoing Ankr transactions in 24h and 7d windows and converts USD", async () => {
	process.env.ANKR_API_KEY = "test-ankr";
	const seenAddresses: string[] = [];
	__setBurnRateDepsForTest({
		now: () => NOW_MS,
		priceUsd: async () => 600,
		fetchImpl: async (_input, init) => {
			const body = JSON.parse(String(init?.body)) as { params: { address: string } };
			seenAddresses.push(body.params.address);
			return ankrResponse([
				{ from: SAFE, value: wei("1"), timestamp: NOW_SECONDS - 60 * 60 },
				{ from: SAFE, value: wei("2"), timestamp: NOW_SECONDS - 2 * 86_400 },
				{ from: SAFE, value: wei("3"), timestamp: NOW_SECONDS - 8 * 86_400 },
				{ from: "0xffffffffffffffffffffffffffffffffffffffff", value: wei("4"), timestamp: NOW_SECONDS - 30 },
				{ from: SAFE, value: wei("0.5"), timestamp: NOW_SECONDS - 6 * 86_400 },
			]);
		},
	});

	const result = await computeBurnRate(AGENT, [wallet("safe", SAFE, "agent-safe")], 3_000);

	assert.deepEqual(seenAddresses, [SAFE]);
	assert.equal(result.source, "ankr");
	assert.equal(result.burn24hBnb, 1);
	assert.equal(result.burn7dBnb, 3.5);
	assert.equal(result.burn24hUsd, 600);
	assert.equal(result.burn7dUsd, 2100);
	assert.equal(result.runwayDays, 5);
	assert.deepEqual(result.byWallet, [{ walletId: "safe", address: SAFE, outflow24hBnb: 1, outflow7dBnb: 3.5 }]);
});

test("computeBurnRate filters patron and venue-bridge wallets", async () => {
	process.env.ANKR_API_KEY = "test-ankr";
	const seenAddresses: string[] = [];
	__setBurnRateDepsForTest({
		now: () => NOW_MS,
		priceUsd: async () => 600,
		fetchImpl: async (_input, init) => {
			const body = JSON.parse(String(init?.body)) as { params: { address: string } };
			seenAddresses.push(body.params.address);
			return ankrResponse([{ from: body.params.address, value: wei("1"), timestamp: NOW_SECONDS - 10 }]);
		},
	});

	const result = await computeBurnRate(
		AGENT,
		[
			wallet("safe", SAFE, "agent-safe"),
			wallet("hot", HOT, "agent-hot"),
			wallet("patron", PATRON, "patron"),
			wallet("bridge", BRIDGE, "venue-bridge"),
		],
		1_000,
	);

	assert.deepEqual(seenAddresses, [SAFE, HOT]);
	assert.equal(result.burn24hBnb, 2);
	assert.equal(result.burn7dBnb, 2);
	assert.deepEqual(
		result.byWallet.map((item) => item.walletId),
		["safe", "hot"],
	);
});

test("computeBurnRate caps runway at null when burn is zero", async () => {
	process.env.ANKR_API_KEY = "test-ankr";
	__setBurnRateDepsForTest({
		now: () => NOW_MS,
		priceUsd: async () => 600,
		fetchImpl: async () => ankrResponse([]),
	});

	const result = await computeBurnRate(AGENT, [wallet("safe", SAFE, "agent-safe")], 3_000);

	assert.equal(result.burn24hBnb, 0);
	assert.equal(result.burn24hUsd, 0);
	assert.equal(result.runwayDays, null);
});

test("computeBurnRate returns honest rpc-direct zero stub when no history provider keys are configured", async () => {
	let fetchCalled = false;
	__setBurnRateDepsForTest({
		now: () => NOW_MS,
		priceUsd: async () => 600,
		logger: { warn() {} },
		fetchImpl: async () => {
			fetchCalled = true;
			return ankrResponse([]);
		},
	});

	const result = await computeBurnRate(AGENT, [wallet("safe", SAFE, "agent-safe")], 3_000);

	assert.equal(fetchCalled, false);
	assert.equal(result.source, "rpc-direct");
	assert.equal(result.burn24hBnb, 0);
	assert.equal(result.burn7dBnb, 0);
});
