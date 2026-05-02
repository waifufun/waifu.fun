import type { Address, Hash } from "viem";

import type { AdapterSpec } from "../../types.js";

export const PANCAKE_V3_SWAP_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4" as const;
export const PANCAKE_V3_QUOTER_V2 = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997" as const;
export const PANCAKE_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as const;
export const PANCAKE_V3_WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;

export type PancakeV3Fee = 100 | 500 | 2500 | 10000;

export interface PancakeV3SwapInput {
	tokenIn: Address;
	tokenOut: Address;
	amountIn: bigint;
	minAmountOut: bigint;
	fee?: PancakeV3Fee;
	recipient: Address;
	deadline: bigint;
}

export interface PancakeV3SwapOutput {
	hash: Hash;
	amountOut: bigint;
}

export interface PancakeV3QuoteInput {
	tokenIn: Address;
	tokenOut: Address;
	amountIn: bigint;
	fee?: PancakeV3Fee;
}

export interface PancakeV3QuoteOutput {
	amountOut: bigint;
}

export const DEFAULT_PANCAKE_V3_FEE: PancakeV3Fee = 2500;

export const pancakeV3Spec = {
	slug: "pancakeswap-v3",
	name: "PancakeSwap v3",
	chains: [56],
	tier: "default",
	contracts: {
		swapRouter: PANCAKE_V3_SWAP_ROUTER,
		quoterV2: PANCAKE_V3_QUOTER_V2,
		factory: PANCAKE_V3_FACTORY,
		wbnb: PANCAKE_V3_WBNB,
	},
	actions: {
		swap: {
			name: "swap",
			label: "Swap",
			description: "Swap an exact input amount through PancakeSwap v3 on BSC.",
			permissions: [
				{
					label: "PancakeSwap v3 exactInputSingle",
					target: PANCAKE_V3_SWAP_ROUTER,
					selectors: ["0x04e45aaf"],
				},
			],
			cost: {
				gasEstimate: 220_000n,
			},
		},
		quote: {
			name: "quote",
			label: "Quote",
			description: "Quote an exact input swap through PancakeSwap v3 on BSC.",
			permissions: [
				{
					label: "PancakeSwap v3 QuoterV2 quoteExactInputSingle",
					target: PANCAKE_V3_QUOTER_V2,
					selectors: ["0xc6a5026a"],
				},
			],
			cost: {
				gasEstimate: 120_000n,
			},
		},
	},
} as const satisfies AdapterSpec<{
	swap: {
		name: "swap";
		label: string;
		description: string;
		permissions: [{ label: string; target: typeof PANCAKE_V3_SWAP_ROUTER; selectors: ["0x04e45aaf"] }];
		cost: { gasEstimate: bigint };
		_phantomInput?: PancakeV3SwapInput;
		_phantomOutput?: PancakeV3SwapOutput;
	};
	quote: {
		name: "quote";
		label: string;
		description: string;
		permissions: [{ label: string; target: typeof PANCAKE_V3_QUOTER_V2; selectors: ["0xc6a5026a"] }];
		cost: { gasEstimate: bigint };
		_phantomInput?: PancakeV3QuoteInput;
		_phantomOutput?: PancakeV3QuoteOutput;
	};
}>;
