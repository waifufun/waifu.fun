import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { Database } from "../client.js";
import { tokens } from "../schema/tokens.js";
import { trades } from "../schema/trades.js";

export interface TokenListQuery {
	status?: "tradable" | "dex" | "staged" | undefined;
	creatorAddress?: string | undefined;
	search?: string | undefined;
	featured?: boolean | undefined;
	sort?: "trending" | "new" | "marketCap" | undefined;
	lifecycle?: "all" | "bonding" | "bonded" | undefined;
	limit: number;
	offset?: number | undefined;
	page?: number | undefined;
}

export interface TokenSummary {
	address: string;
	name: string;
	symbol: string;
	status: "tradable" | "dex" | "staged";
	progressPercent: number;
	creatorAddress: string;
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
	agentId: string | null;
}

export interface TokenListResult {
	items: TokenSummary[];
	total: number;
	limit: number;
	offset: number;
	page: number;
	hasMore: boolean;
}

export interface TokenTradesQuery {
	address: string;
	limit: number;
}

export interface TradeRecord {
	id: string;
	tokenAddress: string;
	side: "buy" | "sell";
	traderAddress: string;
	amountIn: string;
	amountOut: string;
	txHash: string;
	blockNumber: number;
	timestamp: string;
}

// Map DB status to API status
function mapTokenStatus(
	dbStatus: "active" | "migrating" | "migrated" | "hidden" | "delisted",
): "tradable" | "dex" | "staged" {
	switch (dbStatus) {
		case "active":
			return "tradable";
		case "migrated":
			return "dex";
		default:
			return "staged";
	}
}

// Map API status to DB status
function mapApiStatusToDb(
	apiStatus: "tradable" | "dex" | "staged",
): "active" | "migrating" | "migrated" | "hidden" | "delisted" {
	switch (apiStatus) {
		case "tradable":
			return "active";
		case "dex":
			return "migrated";
		case "staged":
			return "migrating";
	}
}

// Calculate progress percentage from curve data
function calculateProgress(curveProgress: string | null, curveLimit: string | null): number {
	if (!curveProgress || !curveLimit) return 0;
	const progress = Number.parseFloat(curveProgress);
	const limit = Number.parseFloat(curveLimit);
	if (!Number.isFinite(progress) || !Number.isFinite(limit) || limit === 0) return 0;
	return Math.min(100, Math.round((progress / limit) * 100));
}

function buildTokenSearchCondition(search: string) {
	const searchTerm = search.trim();
	const contains = `%${searchTerm}%`;
	const addressPrefix = `${searchTerm.toLowerCase()}%`;
	const searchVector = sql`to_tsvector('english', coalesce(${tokens.name}, '') || ' ' || coalesce(${tokens.ticker}, '') || ' ' || coalesce(${tokens.contractAddress}, ''))`;

	return or(
		sql`${searchVector} @@ websearch_to_tsquery('english', ${searchTerm})`,
		ilike(tokens.name, contains),
		ilike(tokens.ticker, contains),
		ilike(tokens.contractAddress, addressPrefix),
	);
}

function buildTokenOrderBy(sort: TokenListQuery["sort"]) {
	switch (sort) {
		case "marketCap":
			return [
				sql`${tokens.marketCapUsd} desc nulls last`,
				sql`${tokens.lastTradeAt} desc nulls last`,
				desc(tokens.createdAt),
				asc(tokens.contractAddress),
			] as const;
		case "new":
			return [desc(tokens.createdAt), asc(tokens.contractAddress)] as const;
		default:
			return [
				sql`${tokens.lastTradeAt} desc nulls last`,
				sql`${tokens.volume24h} desc nulls last`,
				sql`${tokens.marketCapUsd} desc nulls last`,
				desc(tokens.createdAt),
				asc(tokens.contractAddress),
			] as const;
	}
}

function mapTokenSummary(row: {
	address: string;
	name: string;
	symbol: string;
	status: "active" | "migrating" | "migrated" | "hidden" | "delisted";
	creatorAddress: string;
	price: string | null;
	marketCap: string | null;
	curveProgress: string | null;
	curveLimit: string | null;
	createdAt: Date;
	image: string | null;
	chainId: number;
	isFeatured: boolean;
	description: string | null;
	volume24h: string | null;
	holderCount: number | null;
	priceChange24h: string | null;
	isVerified: boolean;
	isImported: boolean;
	launchPlatform: string;
	ownerClaimStatus: string;
	agentStatus: string;
	lastTradeAt: Date | null;
}): TokenSummary {
	return {
		address: row.address,
		name: row.name,
		symbol: row.symbol,
		status: mapTokenStatus(row.status),
		progressPercent: calculateProgress(row.curveProgress, row.curveLimit),
		creatorAddress: row.creatorAddress,
		price: row.price ?? "0",
		marketCap: row.marketCap ?? "0",
		volume24h: row.volume24h ?? "0",
		holders: Number(row.holderCount ?? 0),
		priceChange24h: row.priceChange24h ?? "0",
		createdAt: row.createdAt.toISOString(),
		image: row.image ?? null,
		chain: "evm",
		chainId: row.chainId,
		featured: row.isFeatured,
		description: row.description ?? null,
		isVerified: row.isVerified,
		isImported: row.isImported,
		launchPlatform: row.launchPlatform,
		ownerClaimStatus: row.ownerClaimStatus,
		agentStatus: row.agentStatus,
		lastTradeAt: row.lastTradeAt?.toISOString() ?? null,
	};
}

export async function listTokens(db: Database, query: TokenListQuery): Promise<TokenListResult> {
	const conditions = [];
	const limit = query.limit;
	const offset = query.offset ?? Math.max((query.page ?? 1) - 1, 0) * limit;
	const page = Math.floor(offset / limit) + 1;
	const sort = query.sort ?? "trending";
	const lifecycle = query.lifecycle ?? "all";

	// Discovery/search should stay scoped to public, discoverable token states.
	conditions.push(inArray(tokens.status, ["active", "migrating", "migrated"]));

	if (lifecycle === "bonding") {
		conditions.push(inArray(tokens.status, ["active", "migrating"]));
	}

	if (lifecycle === "bonded") {
		conditions.push(eq(tokens.status, "migrated"));
	}

	if (query.status) {
		conditions.push(eq(tokens.status, mapApiStatusToDb(query.status)));
	}

	if (query.creatorAddress) {
		conditions.push(eq(tokens.creatorAddress, query.creatorAddress.toLowerCase()));
	}

	if (typeof query.featured === "boolean") {
		conditions.push(eq(tokens.isFeatured, query.featured));
	}

	if (query.search) {
		conditions.push(buildTokenSearchCondition(query.search));
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
	const orderByClause = buildTokenOrderBy(sort);

	const [countRows, rows] = await Promise.all([
		db
			.select({ total: sql<number>`count(*)`.mapWith(Number) })
			.from(tokens)
			.where(whereClause),
		db
			.select({
				address: tokens.contractAddress,
				name: tokens.name,
				symbol: tokens.ticker,
				status: tokens.status,
				creatorAddress: tokens.creatorAddress,
				price: tokens.currentPrice,
				marketCap: tokens.marketCapUsd,
				curveProgress: tokens.curveProgress,
				curveLimit: tokens.curveLimit,
				createdAt: tokens.createdAt,
				image: tokens.imageUrl,
				chainId: tokens.chainId,
				isFeatured: tokens.isFeatured,
				description: tokens.description,
				volume24h: tokens.volume24h,
				holderCount: tokens.holderCount,
				priceChange24h: tokens.priceChange24h,
				isVerified: tokens.isVerified,
				isImported: tokens.isImported,
				launchPlatform: tokens.launchPlatform,
				ownerClaimStatus: tokens.ownerClaimStatus,
				agentStatus: tokens.agentStatus,
				lastTradeAt: tokens.lastTradeAt,
			})
			.from(tokens)
			.where(whereClause)
			.orderBy(...orderByClause)
			.limit(limit)
			.offset(offset),
	]);

	const total = countRows[0]?.total ?? 0;
	const items = rows.map(mapTokenSummary);

	return {
		items,
		total,
		limit,
		offset,
		page,
		hasMore: offset + items.length < total,
	};
}

export async function getTokenByAddress(db: Database, address: string): Promise<TokenDetail | null> {
	const result = await db
		.select({
			address: tokens.contractAddress,
			name: tokens.name,
			symbol: tokens.ticker,
			description: tokens.description,
			status: tokens.status,
			creatorAddress: tokens.creatorAddress,
			price: tokens.currentPrice,
			marketCap: tokens.marketCapUsd,
			curveProgress: tokens.curveProgress,
			curveLimit: tokens.curveLimit,
			metadataUri: tokens.metadataUri,
			poolAddress: tokens.dexPoolAddress,
			createdAt: tokens.createdAt,
			chainId: tokens.chainId,
			image: tokens.imageUrl,
			isFeatured: tokens.isFeatured,
			volume24h: tokens.volume24h,
			holderCount: tokens.holderCount,
			priceChange24h: tokens.priceChange24h,
			isVerified: tokens.isVerified,
			isImported: tokens.isImported,
			launchPlatform: tokens.launchPlatform,
			ownerClaimStatus: tokens.ownerClaimStatus,
			agentId: tokens.agentId,
			agentStatus: tokens.agentStatus,
			lastTradeAt: tokens.lastTradeAt,
		})
		.from(tokens)
		.where(eq(tokens.contractAddress, address.toLowerCase()))
		.limit(1);

	if (result.length === 0 || !result[0]) {
		return null;
	}

	const row = result[0];

	let metadataCid: string | null = null;
	if (row.metadataUri) {
		const cidMatch = row.metadataUri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
		if (cidMatch) {
			metadataCid = cidMatch[1] ?? null;
		}
	}

	return {
		...mapTokenSummary({
			address: row.address,
			name: row.name,
			symbol: row.symbol,
			status: row.status,
			creatorAddress: row.creatorAddress,
			price: row.price,
			marketCap: row.marketCap,
			curveProgress: row.curveProgress,
			curveLimit: row.curveLimit,
			createdAt: row.createdAt,
			image: row.image,
			chainId: row.chainId,
			isFeatured: row.isFeatured,
			description: row.description,
			volume24h: row.volume24h,
			holderCount: row.holderCount,
			priceChange24h: row.priceChange24h,
			isVerified: row.isVerified,
			isImported: row.isImported,
			launchPlatform: row.launchPlatform,
			ownerClaimStatus: row.ownerClaimStatus,
			agentStatus: row.agentStatus,
			lastTradeAt: row.lastTradeAt,
		}),
		description: row.description ?? "",
		metadataCid,
		metadataUri: row.metadataUri ?? null,
		quoteTokenSymbol: "BNB",
		quoteTokenAddress: null,
		poolAddress: row.poolAddress ?? null,
		createdBlock: null,
		agentId: row.agentId ?? null,
	};
}

export async function listTokenTrades(db: Database, query: TokenTradesQuery): Promise<TradeRecord[]> {
	const results = await db
		.select({
			id: trades.id,
			tokenAddress: trades.tokenAddress,
			side: trades.side,
			traderAddress: trades.traderAddress,
			amountIn: trades.amountIn,
			amountOut: trades.amountOut,
			txHash: trades.txHash,
			blockNumber: trades.blockNumber,
			timestamp: trades.blockTimestamp,
		})
		.from(trades)
		.where(eq(trades.tokenAddress, query.address.toLowerCase()))
		.orderBy(desc(trades.blockTimestamp))
		.limit(query.limit);

	return results.map((row) => ({
		id: row.id.toString(),
		tokenAddress: row.tokenAddress,
		side: row.side,
		traderAddress: row.traderAddress,
		amountIn: row.amountIn,
		amountOut: row.amountOut,
		txHash: row.txHash,
		blockNumber: Number(row.blockNumber),
		timestamp: row.timestamp.toISOString(),
	}));
}

/* ------------------------------------------------------------------ */
/*  Chart / OHLCV candle aggregation                                  */
/* ------------------------------------------------------------------ */

export type ChartInterval = "5m" | "15m" | "1h" | "4h" | "1d";

export interface ChartQuery {
	address: string;
	interval: ChartInterval;
	from: Date;
	to: Date;
	limit: number;
}

export interface CandleRecord {
	timestamp: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/**
 * Build the SQL bucket expression for a given candle interval.
 */
function bucketExpr(interval: ChartInterval): string {
	switch (interval) {
		case "5m":
			return `date_trunc('hour', block_timestamp) + (extract(minute from block_timestamp)::int / 5) * interval '5 minutes'`;
		case "15m":
			return `date_trunc('hour', block_timestamp) + (extract(minute from block_timestamp)::int / 15) * interval '15 minutes'`;
		case "1h":
			return `date_trunc('hour', block_timestamp)`;
		case "4h":
			return `date_trunc('day', block_timestamp) + (extract(hour from block_timestamp)::int / 4) * interval '4 hours'`;
		case "1d":
			return `date_trunc('day', block_timestamp)`;
	}
}

export async function getTokenChartData(db: Database, query: ChartQuery): Promise<CandleRecord[]> {
	const bucket = bucketExpr(query.interval);

	// bucket expression is built from a validated enum, safe to inline.
	// All user-supplied values go through drizzle sql`` parameterization.
	const stmt = sql`
    SELECT
      ${sql.raw(bucket)} AS bucket,
      (array_agg(price ORDER BY block_timestamp ASC))[1]  AS open,
      max(price)                                            AS high,
      min(price)                                            AS low,
      (array_agg(price ORDER BY block_timestamp DESC))[1]  AS close,
      coalesce(sum(usd_value), 0)                          AS volume
    FROM trades
    WHERE token_address = ${query.address.toLowerCase()}
      AND block_timestamp >= ${query.from.toISOString()}::timestamptz
      AND block_timestamp <= ${query.to.toISOString()}::timestamptz
      AND price IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket ASC
    LIMIT ${query.limit}
  `;

	const rows = await db.execute<{
		bucket: Date | string;
		open: string;
		high: string;
		low: string;
		close: string;
		volume: string;
	}>(stmt);

	return rows.map((r) => ({
		timestamp: new Date(r.bucket).toISOString(),
		open: Number(r.open),
		high: Number(r.high),
		low: Number(r.low),
		close: Number(r.close),
		volume: Number(r.volume),
	}));
}
// ─── Agent linking ────────────────────────────────────────────────

export async function linkAgentToToken(db: Database, tokenAddress: string, agentId: string): Promise<void> {
	await db
		.update(tokens)
		.set({
			agentId,
			agentStatus: "provisioning",
			updatedAt: new Date(),
		})
		.where(eq(tokens.contractAddress, tokenAddress.toLowerCase()));
}
