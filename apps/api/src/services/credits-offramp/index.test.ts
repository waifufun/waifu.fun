import assert from "node:assert/strict";
import test from "node:test";

import type {
	ElizaCryptoPaymentConfirmResult,
	ElizaCryptoPaymentCreateResult,
	ElizaCryptoStatus,
} from "../eliza-client.js";
import { CreditsOffRamp, type OffRampElizaClient } from "./index.js";

const BSC_RECEIVE = "0x93cacDACDf6791be31EA44742CA94db238C887EB";

function statusWithBsc(): ElizaCryptoStatus {
	return {
		enabled: true,
		oxapayEnabled: true,
		directWallet: {
			enabled: true,
			networks: [
				{
					network: "bsc",
					displayName: "BNB Smart Chain",
					chainId: 56,
					tokenSymbol: "USDT",
					tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
					tokenDecimals: 18,
					tokens: [
						{ symbol: "BNB", kind: "native", decimals: 18 },
						{
							symbol: "USDT",
							kind: "bep20",
							tokenAddress: "0x55d398326f99059fF775485246999027B3197955",
							decimals: 18,
						},
						{
							symbol: "U",
							kind: "bep20",
							tokenAddress: "0xcE24439F2D9C6a2289F741120FE202248B666666",
							decimals: 18,
						},
					],
					receiveAddress: BSC_RECEIVE,
					enabled: true,
				},
			],
			promotion: { code: "bsc", network: "bsc", minimumUsd: 10, bonusCredits: 5 },
		},
		isTestnet: false,
	};
}

function makeClient(overrides: Partial<OffRampElizaClient> & { hasSession: boolean }): OffRampElizaClient {
	return {
		getCryptoStatus: overrides.getCryptoStatus ?? (async () => statusWithBsc()),
		createCryptoPayment:
			overrides.createCryptoPayment ?? (async () => ({ paymentId: "pay-1" }) as ElizaCryptoPaymentCreateResult),
		confirmCryptoPayment:
			overrides.confirmCryptoPayment ??
			(async () => ({ status: "confirmed", creditsAdded: 25 }) as ElizaCryptoPaymentConfirmResult),
		hasCryptoSession: () => overrides.hasSession,
	};
}

const deps = { priceUsd: async () => 600, now: () => 1_700_000_000_000 };

test("quoteUsd returns BSC receive address, BNB amount, and automatable=false without a session", async () => {
	const offRamp = new CreditsOffRamp(makeClient({ hasSession: false }), deps);
	const quote = await offRamp.quoteUsd(60);
	assert.equal(quote.receiveAddress, BSC_RECEIVE);
	assert.equal(quote.chainId, 56);
	assert.equal(quote.network, "BEP20");
	assert.equal(quote.usd, 60);
	assert.equal(quote.bnb, 0.1); // 60 / 600
	assert.equal(quote.bnbPriceUsd, 600);
	assert.equal(quote.automatable, false);
	assert.deepEqual(quote.promotion, { minimumUsd: 10, bonusCredits: 5 });
});

test("quoteUsd reports automatable=true when a session token is present", async () => {
	const offRamp = new CreditsOffRamp(makeClient({ hasSession: true }), deps);
	const quote = await offRamp.quoteUsd(30);
	assert.equal(quote.automatable, true);
	assert.equal(quote.bnb, 0.05);
});

test("convert returns honest manual instructions when no session token", async () => {
	const offRamp = new CreditsOffRamp(makeClient({ hasSession: false }), deps);
	const result = await offRamp.convert({ usd: 60, transactionHash: `0x${"a".repeat(64)}` });
	assert.equal(result.automatable, false);
	if (result.automatable === false) {
		assert.equal(result.receiveAddress, BSC_RECEIVE);
		assert.equal(result.bnb, 0.1);
		assert.ok(result.steps.length >= 3);
		assert.match(result.reason, /session token/i);
	}
});

test("convert runs the real directWallet create+confirm when session + tx hash present", async () => {
	const calls: { create?: unknown; confirm?: [string, string] } = {};
	const client = makeClient({
		hasSession: true,
		createCryptoPayment: async (input) => {
			calls.create = input;
			return { paymentId: "pay-xyz" };
		},
		confirmCryptoPayment: async (paymentId, txHash) => {
			calls.confirm = [paymentId, txHash];
			return { status: "confirmed", creditsAdded: 60 };
		},
	});
	const offRamp = new CreditsOffRamp(client, deps);
	const txHash = `0x${"b".repeat(64)}`;
	const result = await offRamp.convert({ usd: 60, transactionHash: txHash });
	assert.equal(result.automatable, true);
	if (result.automatable === true) {
		assert.equal(result.paymentId, "pay-xyz");
		assert.equal(result.transactionHash, txHash);
		assert.equal(result.usd, 60);
		assert.equal(result.bnb, 0.1);
		assert.equal(result.creditsAdded, 60);
		assert.equal(result.status, "confirmed");
	}
	assert.deepEqual(calls.create, { amountUsd: 60, payCurrency: "BNB", network: "BEP20" });
	assert.deepEqual(calls.confirm, ["pay-xyz", txHash]);
});

test("convert can create+confirm a USDT/BEP20 payment without a BNB price lookup", async () => {
	const calls: { create?: unknown; confirm?: [string, string] } = {};
	let priceCalls = 0;
	const client = makeClient({
		hasSession: true,
		createCryptoPayment: async (input) => {
			calls.create = input;
			return { paymentId: "pay-usdt" };
		},
		confirmCryptoPayment: async (paymentId, txHash) => {
			calls.confirm = [paymentId, txHash];
			return { status: "confirmed", creditsAdded: 25 };
		},
	});
	const offRamp = new CreditsOffRamp(client, {
		priceUsd: async () => {
			priceCalls += 1;
			return null;
		},
		now: deps.now,
	});
	const txHash = `0x${"d".repeat(64)}`;
	const result = await offRamp.convert({ usd: 25, transactionHash: txHash, payCurrency: "USDT" });
	assert.equal(result.automatable, true);
	if (result.automatable === true) {
		assert.equal(result.paymentId, "pay-usdt");
		assert.equal(result.usd, 25);
		assert.equal(result.bnb, 0);
		assert.equal(result.bnbPriceUsd, 0);
	}
	assert.equal(priceCalls, 0);
	assert.deepEqual(calls.create, { amountUsd: 25, payCurrency: "USDT", network: "BEP20" });
	assert.deepEqual(calls.confirm, ["pay-usdt", txHash]);
});

test("convert rejects non-positive USDT amounts before creating a payment", async () => {
	const client = makeClient({ hasSession: true });
	const offRamp = new CreditsOffRamp(client, deps);
	await assert.rejects(
		() => offRamp.convert({ usd: 0, transactionHash: `0x${"e".repeat(64)}`, payCurrency: "USDT" }),
		/usd must be positive/i,
	);
});

test("convert rejects a malformed tx hash even with a session", async () => {
	const offRamp = new CreditsOffRamp(makeClient({ hasSession: true }), deps);
	await assert.rejects(() => offRamp.convert({ usd: 60, transactionHash: "not-a-hash" }), /transactionHash must be/);
});

test("buildConversionIntent converts a creditsShareBps slice of a deposit", async () => {
	const offRamp = new CreditsOffRamp(makeClient({ hasSession: false }), deps);
	const intent = await offRamp.buildConversionIntent({
		depositTxHash: `0x${"c".repeat(64)}`,
		agentTokenAddress: "0xAbCdEf0000000000000000000000000000000001",
		safeAddress: "0xSAFE000000000000000000000000000000000002".toLowerCase(),
		depositBnb: 1,
		creditsShareBps: 2500, // 25%
	});
	assert.equal(intent.convertBnb, 0.25);
	assert.equal(intent.convertUsd, 150); // 0.25 * 600
	assert.equal(intent.creditsShareBps, 2500);
	assert.equal(intent.receiveAddress, BSC_RECEIVE);
	assert.equal(intent.agentTokenAddress, "0xabcdef0000000000000000000000000000000001");
});

test("quoteUsd throws when BSC directWallet is unavailable", async () => {
	const client = makeClient({
		hasSession: false,
		getCryptoStatus: async () => ({ enabled: true, directWallet: { enabled: false, networks: [] } }),
	});
	const offRamp = new CreditsOffRamp(client, deps);
	await assert.rejects(() => offRamp.quoteUsd(10), /unavailable/);
});

test("quoteUsd throws when BNB price is unavailable", async () => {
	const offRamp = new CreditsOffRamp(makeClient({ hasSession: true }), { priceUsd: async () => null, now: () => 0 });
	await assert.rejects(() => offRamp.quoteUsd(10), /price unavailable/i);
});
