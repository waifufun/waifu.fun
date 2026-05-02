import { type Address, type Hex, encodeFunctionData } from "viem";

import {
	DEFAULT_PANCAKE_V3_FEE,
	PANCAKE_V3_QUOTER_V2,
	PANCAKE_V3_SWAP_ROUTER,
	PANCAKE_V3_WBNB,
	type PancakeV3QuoteInput,
	type PancakeV3SwapInput,
} from "./spec.js";

export const ZERO_SQRT_PRICE_LIMIT_X96 = 0n;

export const pancakeV3SwapRouterAbi = [
	{
		type: "function",
		name: "exactInputSingle",
		stateMutability: "payable",
		inputs: [
			{
				name: "params",
				type: "tuple",
				components: [
					{ name: "tokenIn", type: "address" },
					{ name: "tokenOut", type: "address" },
					{ name: "fee", type: "uint24" },
					{ name: "recipient", type: "address" },
					{ name: "amountIn", type: "uint256" },
					{ name: "amountOutMinimum", type: "uint256" },
					{ name: "sqrtPriceLimitX96", type: "uint160" },
				],
			},
		],
		outputs: [{ name: "amountOut", type: "uint256" }],
	},
] as const;

export const pancakeV3QuoterV2Abi = [
	{
		type: "function",
		name: "quoteExactInputSingle",
		stateMutability: "nonpayable",
		inputs: [
			{
				name: "params",
				type: "tuple",
				components: [
					{ name: "tokenIn", type: "address" },
					{ name: "tokenOut", type: "address" },
					{ name: "amountIn", type: "uint256" },
					{ name: "fee", type: "uint24" },
					{ name: "sqrtPriceLimitX96", type: "uint160" },
				],
			},
		],
		outputs: [
			{ name: "amountOut", type: "uint256" },
			{ name: "sqrtPriceX96After", type: "uint160" },
			{ name: "initializedTicksCrossed", type: "uint32" },
			{ name: "gasEstimate", type: "uint256" },
		],
	},
] as const;

export interface EncodedAdapterCall {
	to: Address;
	data: Hex;
	value: bigint;
}

export const isNativeInput = (tokenIn: Address): boolean => tokenIn.toLowerCase() === PANCAKE_V3_WBNB.toLowerCase();

export const encodeSwap = (input: PancakeV3SwapInput): EncodedAdapterCall => ({
	to: PANCAKE_V3_SWAP_ROUTER,
	data: encodeFunctionData({
		abi: pancakeV3SwapRouterAbi,
		functionName: "exactInputSingle",
		args: [
			{
				tokenIn: input.tokenIn,
				tokenOut: input.tokenOut,
				fee: input.fee ?? DEFAULT_PANCAKE_V3_FEE,
				recipient: input.recipient,
				amountIn: input.amountIn,
				amountOutMinimum: input.minAmountOut,
				sqrtPriceLimitX96: ZERO_SQRT_PRICE_LIMIT_X96,
			},
		],
	}),
	value: isNativeInput(input.tokenIn) ? input.amountIn : 0n,
});

export const encodeQuote = (input: PancakeV3QuoteInput): EncodedAdapterCall => ({
	to: PANCAKE_V3_QUOTER_V2,
	data: encodeFunctionData({
		abi: pancakeV3QuoterV2Abi,
		functionName: "quoteExactInputSingle",
		args: [
			{
				tokenIn: input.tokenIn,
				tokenOut: input.tokenOut,
				amountIn: input.amountIn,
				fee: input.fee ?? DEFAULT_PANCAKE_V3_FEE,
				sqrtPriceLimitX96: ZERO_SQRT_PRICE_LIMIT_X96,
			},
		],
	}),
	value: 0n,
});
