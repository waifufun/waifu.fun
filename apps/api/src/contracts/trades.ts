import { z } from "zod";

import { addressSchema, decimalStringSchema } from "./common.js";

export const tradeSideSchema = z.enum(["buy", "sell"]);
export type TradeSide = z.infer<typeof tradeSideSchema>;

export const tradeQuoteSchema = z.object({
	tokenAddress: addressSchema,
	side: tradeSideSchema,
	amount: decimalStringSchema,
	quoteToken: z.literal("BNB").default("BNB"),
	slippageBps: z.coerce.number().int().min(1).max(5_000).default(100),
});
export type TradeQuoteInput = z.infer<typeof tradeQuoteSchema>;

export interface TradeRecord {
	id: string;
	tokenAddress: z.infer<typeof addressSchema>;
	side: TradeSide;
	traderAddress: z.infer<typeof addressSchema>;
	amountIn: string;
	amountOut: string;
	txHash: string;
	blockNumber: number;
	timestamp: string;
}

export interface TradeQuoteResponse {
	tokenAddress: string;
	side: TradeSide;
	inputAmount: string;
	outputAmount: string;
	quoteToken: "BNB";
	estimatedFeeBps: number;
	slippageBps: number;
	source: "compat-local" | "real-flap-rpc";
	expiresAt: string;
}

export interface PrepareSwapResponse {
	traderAddress: string;
	quote: TradeQuoteResponse;
	call: {
		contractAddress: string;
		method: "swapExactInput";
		calldata?: string;
		permitData: "0x";
		value: string;
	};
	notes: string[];
}
