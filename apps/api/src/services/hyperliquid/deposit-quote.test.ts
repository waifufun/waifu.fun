import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { LifiQuoteInput, LifiQuoteResponse } from "../lifi/client.js";
import {
	ARBITRUM_USDC_ADDRESS,
	HYPERLIQUID_ARBITRUM_BRIDGE,
	HYPERLIQUID_ARBITRUM_CHAIN_ID,
	HyperliquidDepositQuoteError,
	buildHyperliquidDepositQuote,
} from "./deposit-quote.js";

const PATRON = "0x1111111111111111111111111111111111111111";
const BNB = "NATIVE";
const BSC = 56;
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

function lifiQuote(input: LifiQuoteInput, overrides: Partial<LifiQuoteResponse> = {}): LifiQuoteResponse {
	return {
		id: "quote-1",
		type: "lifi",
		tool: "across",
		toolDetails: { key: "across", name: "Across" },
		action: {
			fromChainId: input.fromChain,
			toChainId: input.toChain,
			fromToken: { symbol: input.fromToken === "NATIVE" ? "BNB" : "USDC", address: input.fromToken },
			toToken: { symbol: "USDC", address: input.toToken },
			fromAddress: input.fromAddress,
			toAddress: input.toAddress,
		},
		estimate: {
			fromAmount: input.fromAmount,
			toAmount: "100000000",
			toAmountMin: "99500000",
			approvalAddress: "0x2222222222222222222222222222222222222222",
			executionDuration: 120,
			fromAmountUSD: "100",
			toAmountUSD: "99.5",
		},
		transactionRequest: {
			to: "0x3333333333333333333333333333333333333333",
			from: input.fromAddress,
			value: "100000000000000000",
			data: "0x1234",
			chainId: input.fromChain,
			gasLimit: "21000",
		},
		includedSteps: [{ tool: "across" }],
		...overrides,
	};
}

describe("buildHyperliquidDepositQuote", () => {
	it("quotes source token to patron-owned Arbitrum USDC, then prepares patron-signed HL bridge transfer", async () => {
		const calls: LifiQuoteInput[] = [];
		const quote = await buildHyperliquidDepositQuote(
			{ fromChain: BSC, fromToken: BNB, fromAmount: "100000000000000000", fromAddress: PATRON },
			{
				lifi: {
					getQuote: async (input) => {
						calls.push(input);
						return lifiQuote(input);
					},
				},
			},
		);

		assert.deepEqual(calls, [
			{
				fromChain: BSC,
				toChain: HYPERLIQUID_ARBITRUM_CHAIN_ID,
				fromToken: BNB,
				toToken: ARBITRUM_USDC_ADDRESS,
				fromAmount: "100000000000000000",
				fromAddress: PATRON,
				toAddress: PATRON,
			},
		]);
		assert.equal(quote.mode, "patron-owns-hyperliquid-account");
		assert.equal(quote.depositAccount, PATRON);
		assert.equal(quote.bridgeQuote?.toAmountMin, "99500000");
		assert.equal(quote.depositTx.chainId, HYPERLIQUID_ARBITRUM_CHAIN_ID);
		assert.equal(quote.depositTx.to.toLowerCase(), ARBITRUM_USDC_ADDRESS.toLowerCase());
		assert.equal(quote.depositTx.from, PATRON);
		assert.equal(quote.depositTx.bridge.toLowerCase(), HYPERLIQUID_ARBITRUM_BRIDGE.toLowerCase());
		assert.equal(quote.depositTx.amount, "99500000");
		assert.match(quote.depositTx.data, /^0xa9059cbb/u);
	});

	it("includes an ERC20 approval transaction when Li.Fi returns an approval spender", async () => {
		const quote = await buildHyperliquidDepositQuote(
			{ fromChain: BSC, fromToken: BSC_USDT, fromAmount: "100000000000000000000", fromAddress: PATRON },
			{
				lifi: {
					getQuote: async (input) => lifiQuote(input),
				},
			},
		);
		assert.equal(quote.bridgeQuote?.approvalTx?.to.toLowerCase(), BSC_USDT.toLowerCase());
		assert.equal(quote.bridgeQuote?.approvalTx?.from, PATRON);
		assert.equal(quote.bridgeQuote?.approvalTx?.value, "0");
		assert.equal(quote.bridgeQuote?.approvalTx?.chainId, BSC);
		assert.match(quote.bridgeQuote?.approvalTx?.data ?? "", /^0x095ea7b3/u);
	});

	it("skips Li.Fi when the patron already has Arbitrum USDC", async () => {
		let called = false;
		const quote = await buildHyperliquidDepositQuote(
			{
				fromChain: HYPERLIQUID_ARBITRUM_CHAIN_ID,
				fromToken: ARBITRUM_USDC_ADDRESS,
				fromAmount: "50000000",
				fromAddress: PATRON,
			},
			{
				lifi: {
					getQuote: async (input) => {
						called = true;
						return lifiQuote(input);
					},
				},
			},
		);
		assert.equal(called, false);
		assert.equal(quote.bridgeQuote, null);
		assert.equal(quote.depositTx.amount, "50000000");
	});

	it("rejects Li.Fi routes that include conditionally refused bridge steps", async () => {
		await assert.rejects(
			() =>
				buildHyperliquidDepositQuote(
					{ fromChain: BSC, fromToken: BNB, fromAmount: "100000000000000000", fromAddress: PATRON },
					{
						lifi: {
							getQuote: async (input) =>
								lifiQuote(input, {
									tool: "across",
									includedSteps: [{ tool: "eco" }],
								}),
						},
					},
				),
			(err: unknown) =>
				err instanceof HyperliquidDepositQuoteError &&
				err.code === "BRIDGE_STEP_REFUSED" &&
				/ECO_SCOPE_DENIED/u.test(err.message),
		);
	});

	it("rejects Li.Fi routes that do not return funds to the patron wallet", async () => {
		await assert.rejects(
			() =>
				buildHyperliquidDepositQuote(
					{ fromChain: BSC, fromToken: BNB, fromAmount: "100000000000000000", fromAddress: PATRON },
					{
						lifi: {
							getQuote: async (input) =>
								lifiQuote(input, {
									action: { ...lifiQuote(input).action, toAddress: HYPERLIQUID_ARBITRUM_BRIDGE },
								}),
						},
					},
				),
			(err: unknown) =>
				err instanceof HyperliquidDepositQuoteError &&
				err.code === "RECIPIENT_MISMATCH" &&
				/patron wallet/u.test(err.message),
		);
	});
});
