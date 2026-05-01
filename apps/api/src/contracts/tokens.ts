import { z } from "zod";

import { addressSchema, paginationQuerySchema } from "./common.js";

export const tokenStatusSchema = z.enum(["tradable", "dex", "staged"]);
export type TokenStatus = z.infer<typeof tokenStatusSchema>;

export const tokenSortSchema = z.enum(["trending", "new", "marketCap"]);
export type TokenSort = z.infer<typeof tokenSortSchema>;

export const tokenLifecycleSchema = z.enum(["all", "bonding", "bonded"]);
export type TokenLifecycle = z.infer<typeof tokenLifecycleSchema>;

export const tokenListQuerySchema = paginationQuerySchema
	.extend({
		status: tokenStatusSchema.optional(),
		creatorAddress: addressSchema.optional(),
		search: z.string().trim().min(1).max(64).optional(),
		featured: z
			.enum(["true", "false"])
			.transform((v) => v === "true")
			.optional(),
		sort: tokenSortSchema.default("trending"),
		lifecycle: tokenLifecycleSchema.default("all"),
		page: z.coerce.number().int().min(1).default(1),
		offset: z.coerce.number().int().min(0).optional(),
	})
	.transform((query) => {
		const offset = query.offset ?? (query.page - 1) * query.limit;

		return {
			...query,
			offset,
			page: Math.floor(offset / query.limit) + 1,
		};
	});
export type TokenListQuery = z.infer<typeof tokenListQuerySchema>;

export const tokenTradesQuerySchema = paginationQuerySchema.extend({
	address: addressSchema,
});
export type TokenTradesQuery = z.infer<typeof tokenTradesQuerySchema>;

/* ---- Chart / OHLCV query ---- */

export const chartIntervalSchema = z.enum(["5m", "15m", "1h", "4h", "1d"]);
export type ChartInterval = z.infer<typeof chartIntervalSchema>;

export const tokenChartQuerySchema = z.object({
	interval: chartIntervalSchema.default("1h"),
	from: z
		.string()
		.optional()
		.transform((v) => {
			if (!v) return undefined;
			const asNum = Number(v);
			if (!Number.isNaN(asNum) && asNum > 1_000_000_000) {
				return new Date(asNum * 1000);
			}
			const d = new Date(v);
			if (Number.isNaN(d.getTime())) return undefined;
			return d;
		}),
	to: z
		.string()
		.optional()
		.transform((v) => {
			if (!v) return new Date();
			const asNum = Number(v);
			if (!Number.isNaN(asNum) && asNum > 1_000_000_000) {
				return new Date(asNum * 1000);
			}
			const d = new Date(v);
			if (Number.isNaN(d.getTime())) return new Date();
			return d;
		}),
	limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type TokenChartQuery = z.infer<typeof tokenChartQuerySchema>;

export interface CandleRecord {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface TokenSummary {
	address: z.infer<typeof addressSchema>;
	name: string;
	symbol: string;
	status: TokenStatus;
	progressPercent: number;
	creatorAddress: z.infer<typeof addressSchema>;
	price: string;
	marketCap: string;
	volume24h: string;
	holders: number;
	priceChange24h: string;
	createdAt: string;
	image: string | null;
	chain: string;
	chainId: number;
	featured: boolean;
	description: string | null;
	isVerified: boolean;
	isImported: boolean;
	launchPlatform: string;
	ownerClaimStatus: string;
	agentStatus: string;
	lastTradeAt: string | null;
}

export interface TokenDetail extends TokenSummary {
	description: string;
	metadataCid: string | null;
	metadataUri: string | null;
	quoteTokenSymbol: string;
	quoteTokenAddress: string | null;
	poolAddress: string | null;
	createdBlock: number | null;
	agentId?: string | null;
}

export interface TokenListResult {
	items: TokenSummary[];
	total: number;
	limit: number;
	offset: number;
	page: number;
	hasMore: boolean;
}
