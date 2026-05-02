import type { Address } from "viem";

import { registerAdapter } from "../../registry.js";
import type { AdapterCallContext, AdapterImpl } from "../../types.js";
import { ZERO_SQRT_PRICE_LIMIT_X96, encodeSwap, isNativeInput, pancakeV3QuoterV2Abi } from "./abis.js";
import { DEFAULT_PANCAKE_V3_FEE, PANCAKE_V3_QUOTER_V2, pancakeV3Spec } from "./spec.js";
import type { PancakeV3QuoteInput, PancakeV3QuoteOutput, PancakeV3SwapInput, PancakeV3SwapOutput } from "./spec.js";

type QuoteExactInputSingleResult = bigint | readonly [bigint, bigint, number, bigint] | { amountOut: bigint };

type PublicClientWithReadContract = {
	readContract: (args: {
		address: Address;
		abi: typeof pancakeV3QuoterV2Abi;
		functionName: "quoteExactInputSingle";
		args: [
			{
				tokenIn: Address;
				tokenOut: Address;
				amountIn: bigint;
				fee: number;
				sqrtPriceLimitX96: bigint;
			},
		];
	}) => Promise<QuoteExactInputSingleResult>;
};

const isPublicClientWithReadContract = (client: unknown): client is PublicClientWithReadContract =>
	typeof client === "object" &&
	client !== null &&
	"readContract" in client &&
	typeof (client as { readContract?: unknown }).readContract === "function";

const extractAmountOut = (result: QuoteExactInputSingleResult): bigint => {
	if (typeof result === "bigint") {
		return result;
	}

	if ("amountOut" in result) {
		return result.amountOut;
	}

	return result[0];
};

export const pancakeV3Impl: AdapterImpl<typeof pancakeV3Spec> = {
	spec: pancakeV3Spec,
	calls: {
		swap: async (ctx: AdapterCallContext, input: unknown): Promise<PancakeV3SwapOutput> => {
			const swapInput = input as PancakeV3SwapInput;
			const encoded = encodeSwap(swapInput);
			const { hash } = await ctx.signAndSend({
				to: encoded.to,
				data: encoded.data,
				value: isNativeInput(swapInput.tokenIn) ? swapInput.amountIn : 0n,
			});

			// TODO(indexer): populate amountOut from the swap receipt/log once action indexing is wired.
			return { hash, amountOut: 0n };
		},
		quote: async (ctx: AdapterCallContext, input: unknown): Promise<PancakeV3QuoteOutput> => {
			const quoteInput = input as PancakeV3QuoteInput;

			if (!isPublicClientWithReadContract(ctx.publicClient)) {
				throw new TypeError("PancakeSwap v3 quote requires ctx.publicClient.readContract");
			}

			const result = await ctx.publicClient.readContract({
				address: PANCAKE_V3_QUOTER_V2,
				abi: pancakeV3QuoterV2Abi,
				functionName: "quoteExactInputSingle",
				args: [
					{
						tokenIn: quoteInput.tokenIn,
						tokenOut: quoteInput.tokenOut,
						amountIn: quoteInput.amountIn,
						fee: quoteInput.fee ?? DEFAULT_PANCAKE_V3_FEE,
						sqrtPriceLimitX96: ZERO_SQRT_PRICE_LIMIT_X96,
					},
				],
			});

			return { amountOut: extractAmountOut(result) };
		},
	},
};

registerAdapter(pancakeV3Impl);
