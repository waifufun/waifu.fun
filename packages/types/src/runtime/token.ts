import { z } from "zod";

import { DEFAULT_CHAIN_ID, hexAddressSchema, numericStringSchema, supportedChainIdSchema } from "./common.js";

export const tokenLifecycleStatusSchema = z.enum(["active", "migrating", "migrated", "hidden", "delisted"]);
export type TokenLifecycleStatus = z.infer<typeof tokenLifecycleStatusSchema>;

export const flapTokenStatusSchema = z.enum(["invalid", "tradable", "in_duel", "killed", "dex", "staged"]);
export type FlapTokenStatus = z.infer<typeof flapTokenStatusSchema>;

export const tokenSummaryStatusSchema = z.enum(["tradable", "dex", "staged"]);
export type TokenSummaryStatus = z.infer<typeof tokenSummaryStatusSchema>;

export const flapTokenMetadataSchema = z.object({
	buy: z.string().url().nullable().default(null),
	creator: hexAddressSchema,
	description: z.string().max(1_024),
	image: z.string().min(1),
	sell: z.string().url().nullable().default(null),
	telegram: z.string().url().nullable().default(null),
	twitter: z.string().url().nullable().default(null),
	website: z.string().url().nullable().default(null),
});

export type FlapTokenMetadata = z.infer<typeof flapTokenMetadataSchema>;

export const tokenSummarySchema = z.object({
	address: hexAddressSchema,
	chainId: supportedChainIdSchema.optional(),
	name: z.string().min(1),
	symbol: z.string().min(1).max(16),
	status: tokenSummaryStatusSchema,
	progress: z.number().min(0).default(0),
	creatorAddress: hexAddressSchema,
});

export type TokenSummary = z.infer<typeof tokenSummarySchema>;

export const tokenDetailSchema = tokenSummarySchema.extend({
	description: z.string().default(""),
	metadataUri: z.string().min(1).nullable().default(null),
	quoteToken: z.string().min(1).default("BNB"),
	price: numericStringSchema.default("0"),
	marketCap: numericStringSchema.default("0"),
});

export type TokenDetail = z.infer<typeof tokenDetailSchema>;

export const tokenRecordSchema = z.object({
	address: hexAddressSchema,
	chainId: supportedChainIdSchema.default(DEFAULT_CHAIN_ID),
	name: z.string().min(1),
	symbol: z.string().min(1).max(16),
	creatorAddress: hexAddressSchema,
	metadataUri: z.string().min(1).nullable().default(null),
	status: tokenLifecycleStatusSchema.default("active"),
	currentPrice: numericStringSchema.nullable().default(null),
	marketCap: numericStringSchema.nullable().default(null),
	progress: numericStringSchema.nullable().default(null),
	quoteTokenAddress: hexAddressSchema.nullable().optional().default(null),
	portalAddress: hexAddressSchema.nullable().optional().default(null),
});

export type TokenRecord = z.infer<typeof tokenRecordSchema>;
