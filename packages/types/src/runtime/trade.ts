import { z } from "zod";

import {
	DEFAULT_CHAIN_ID,
	hexAddressSchema,
	hexHashSchema,
	isoDateTimeSchema,
	numericStringSchema,
	supportedChainIdSchema,
} from "./common.js";

export const tradeSideSchema = z.enum(["buy", "sell"]);
export type TradeSide = z.infer<typeof tradeSideSchema>;

export const tradeQuoteSchema = z.object({
	tokenAddress: hexAddressSchema,
	side: tradeSideSchema,
	amount: numericStringSchema,
	quoteToken: z.union([z.literal("BNB"), hexAddressSchema]).default("BNB"),
});

export type TradeQuoteInput = z.infer<typeof tradeQuoteSchema>;

export const tradeQuoteResponseSchema = z.object({
	tokenAddress: hexAddressSchema,
	side: tradeSideSchema,
	inputAmount: numericStringSchema,
	outputAmount: numericStringSchema,
	slippageBps: z.number().int().nonnegative(),
	source: z.enum(["rpc", "cache", "stub"]),
});

export type TradeQuoteResponse = z.infer<typeof tradeQuoteResponseSchema>;

export const tradeRecordSchema = z.object({
	id: z.string().min(1),
	tokenAddress: hexAddressSchema,
	side: tradeSideSchema,
	traderAddress: hexAddressSchema,
	amountIn: numericStringSchema,
	amountOut: numericStringSchema,
	txHash: z.string().min(1),
	blockNumber: z.number().int().nonnegative(),
	timestamp: isoDateTimeSchema,
});

export type TradeRecord = z.infer<typeof tradeRecordSchema>;

export const indexedTradeRecordSchema = z.object({
	chainId: supportedChainIdSchema.default(DEFAULT_CHAIN_ID),
	tokenAddress: hexAddressSchema,
	traderAddress: hexAddressSchema,
	side: tradeSideSchema,
	amountIn: numericStringSchema,
	amountOut: numericStringSchema,
	txHash: hexHashSchema,
	blockNumber: z.bigint().nonnegative(),
	price: numericStringSchema.nullable().default(null),
	usdValue: numericStringSchema.nullable().default(null),
});

export type IndexedTradeRecord = z.infer<typeof indexedTradeRecordSchema>;
