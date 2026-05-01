import { type SQL, and, asc, desc, eq, sql } from "drizzle-orm";

import { type Database, schema as dbSchema, getDatabase } from "@waifufun/db";

import type { CreatorProfile } from "../contracts/creators.js";
import type { UpdateCreatorInput } from "../contracts/creators.js";
import type { InviteCodeRecord } from "../contracts/invites.js";
import type { CreateLaunchInput, LaunchRecord, LaunchStatus } from "../contracts/launches.js";
import type { AppConfig, DbClient } from "../contracts/services.js";
import type {
	CandleRecord,
	ChartInterval,
	TokenDetail,
	TokenListQuery,
	TokenListResult,
	TokenSummary,
} from "../contracts/tokens.js";
import type { TradeRecord } from "../contracts/trades.js";
import { normalizeAddress } from "../lib/address.js";

const memoryLaunches = new Map<string, LaunchRecord>();
const memoryCreators = new Map<string, CreatorProfile>();
const memoryInviteCodesStore = new Map<string, InviteCodeRecord>();

const seededGenesisToken: TokenDetail = {
	address: "0x0000000000000000000000000000000000008888",
	name: "Waifu Genesis",
	symbol: "WAIFU",
	status: "tradable",
	progressPercent: 12,
	creatorAddress: "0x000000000000000000000000000000000000c0de",
	price: "0.00000123",
	marketCap: "123456.78",
	volume24h: "0",
	holders: 0,
	priceChange24h: "0",
	createdAt: new Date("2026-03-07T18:00:00.000Z").toISOString(),
	description: "Seed token record for the API scaffold, aligned to the Flap/BSC token shape.",
	metadataCid: "bafkreiwaifugenesisstubcid",
	metadataUri: "https://flap.mypinata.cloud/ipfs/bafkreiwaifugenesisstubcid",
	quoteTokenSymbol: "BNB",
	quoteTokenAddress: null,
	poolAddress: null,
	createdBlock: 1,
	image: null,
	chain: "evm",
	chainId: 56,
	featured: false,
	isVerified: true,
	isImported: false,
	launchPlatform: "flap",
	ownerClaimStatus: "unclaimed",
	agentStatus: "none",
	lastTradeAt: new Date("2026-03-07T18:05:00.000Z").toISOString(),
	agentId: null,
};

const seededTokenDetails: TokenDetail[] = [seededGenesisToken];

const seededTrades: TradeRecord[] = [
	{
		id: "trade_seed_1",
		tokenAddress: seededGenesisToken.address,
		side: "buy",
		traderAddress: "0x000000000000000000000000000000000000dEaD",
		amountIn: "0.10",
		amountOut: "12345",
		txHash: "0xseedtrade1",
		blockNumber: 1,
		timestamp: new Date("2026-03-07T18:05:00.000Z").toISOString(),
	},
];

type TokenDbStatus = "active" | "migrating" | "migrated" | "hidden" | "delisted";
type LaunchDbStatus =
	| "draft"
	| "pending_review"
	| "approved"
	| "preparing"
	| "ready"
	| "submitted"
	| "confirmed"
	| "provisioned"
	| "queued"
	| "launching"
	| "live"
	| "failed"
	| "rejected"
	| "provisioned"
	| "queued"
	| "launching"
	| "live";

function listTokenSummaries(): TokenSummary[] {
	return seededTokenDetails.map(
		({
			metadataCid: _metadataCid,
			metadataUri: _metadataUri,
			quoteTokenSymbol: _quoteTokenSymbol,
			quoteTokenAddress: _quoteTokenAddress,
			poolAddress: _poolAddress,
			createdBlock: _createdBlock,
			agentId: _agentId,
			...summary
		}) => summary,
	);
}

function filterByLifecycle(token: TokenSummary, lifecycle: TokenListQuery["lifecycle"]) {
	if (lifecycle === "bonded") {
		return token.status === "dex";
	}

	if (lifecycle === "bonding") {
		return token.status === "tradable" || token.status === "staged";
	}

	return true;
}

function compareBySort(left: TokenSummary, right: TokenSummary, sort: TokenListQuery["sort"]) {
	if (sort === "marketCap") {
		return Number(right.marketCap) - Number(left.marketCap);
	}

	if (sort === "new") {
		return right.createdAt.localeCompare(left.createdAt);
	}

	const lastTradeDiff = new Date(right.lastTradeAt ?? 0).getTime() - new Date(left.lastTradeAt ?? 0).getTime();
	if (lastTradeDiff !== 0) return lastTradeDiff;

	const volumeDiff = Number(right.volume24h) - Number(left.volume24h);
	if (volumeDiff !== 0) return volumeDiff;

	return Number(right.marketCap) - Number(left.marketCap);
}

function getDefaultProfile(address: string): CreatorProfile {
	return {
		address,
		displayName: null,
		bio: null,
		twitter: null,
		telegram: null,
		website: null,
		verified: false,
		featured: false,
	};
}

function mapTokenStatus(dbStatus: TokenDbStatus): TokenSummary["status"] {
	if (dbStatus === "active") return "tradable";
	if (dbStatus === "migrated") return "dex";
	return "staged";
}

function mapApiTokenStatus(apiStatus: TokenSummary["status"]): TokenDbStatus {
	if (apiStatus === "tradable") return "active";
	if (apiStatus === "dex") return "migrated";
	return "migrating";
}

function mapLaunchStatus(dbStatus: LaunchDbStatus): LaunchStatus {
	switch (dbStatus) {
		case "draft":
		case "pending_review":
			return "pending";
		case "approved":
			return "approved";
		case "rejected":
			return "rejected";
		case "preparing":
			return "preparing";
		case "ready":
			return "awaiting_signature";
		case "submitted":
			return "submitted";
		case "confirmed":
			return "launched";
		case "provisioned":
			return "provisioned";
		case "queued":
			return "queued";
		case "launching":
			return "launching";
		case "live":
			return "live";
		case "failed":
			return "failed";
	}
}

function mapApiLaunchStatus(apiStatus: LaunchStatus): LaunchDbStatus {
	switch (apiStatus) {
		case "pending":
			return "pending_review";
		case "approved":
			return "approved";
		case "rejected":
			return "rejected";
		case "preparing":
			return "preparing";
		case "awaiting_signature":
			return "ready";
		case "submitted":
			return "submitted";
		case "launched":
			return "confirmed";
		case "provisioned":
			return "provisioned";
		case "queued":
			return "queued";
		case "launching":
			return "launching";
		case "live":
			return "live";
		case "failed":
			return "failed";
	}
}

function calculateProgress(curveProgress: string | null, curveLimit: string | null): number {
	if (!curveProgress || !curveLimit) return 0;
	const progress = Number.parseFloat(curveProgress);
	const limit = Number.parseFloat(curveLimit);
	if (!Number.isFinite(progress) || !Number.isFinite(limit) || limit <= 0) return 0;
	return Math.min(100, Math.round((progress / limit) * 100));
}

function extractMetadataCid(metadataUri: string | null): string | null {
	if (!metadataUri) return null;
	const cidMatch = metadataUri.match(/(?:\/ipfs\/|ipfs:\/\/)([a-zA-Z0-9]+)/);
	return cidMatch?.[1] ?? null;
}

function normalizeSocials(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}

function buildSocials(input: CreateLaunchInput | UpdateCreatorInput): Record<string, string> {
	const socials: Record<string, string> = {};
	if ("website" in input && input.website) socials.website = input.website;
	if ("twitter" in input && input.twitter) socials.twitter = input.twitter;
	if ("telegram" in input && input.telegram) socials.telegram = input.telegram;
	return socials;
}

function getSocial(socials: unknown, key: "website" | "twitter" | "telegram"): string | undefined {
	const normalized = normalizeSocials(socials);
	const value = normalized[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function saltToHex(salt: Uint8Array | null): string | null {
	if (!salt) return null;
	return `0x${Buffer.from(salt).toString("hex")}`;
}

function mapTokenSummary(row: {
	address: string;
	name: string;
	symbol: string;
	status: TokenDbStatus;
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

function mapTokenDetail(
	row: Parameters<typeof mapTokenSummary>[0] & {
		description: string | null;
		metadataUri: string | null;
		poolAddress: string | null;
		agentId: string | null;
	},
): TokenDetail {
	return {
		...mapTokenSummary(row),
		description: row.description ?? "",
		metadataCid: extractMetadataCid(row.metadataUri),
		metadataUri: row.metadataUri ?? null,
		quoteTokenSymbol: "BNB",
		quoteTokenAddress: null,
		poolAddress: row.poolAddress ?? null,
		createdBlock: null,
		agentId: row.agentId ?? null,
	};
}

function mapLaunchRecord(row: {
	id: string;
	creatorAddress: string | null;
	status: LaunchDbStatus;
	tokenName: string;
	tokenTicker: string;
	tokenDescription: string | null;
	tokenImageUrl: string | null;
	socials: unknown;
	quoteToken: string | null;
	taxRate: number;
	inviteCode: string | null;
	metadataUri: string | null;
	salt: Uint8Array | null;
	createdAt: Date;
	updatedAt: Date;
}): LaunchRecord {
	const website = getSocial(row.socials, "website");
	const twitter = getSocial(row.socials, "twitter");
	const telegram = getSocial(row.socials, "telegram");

	return {
		id: row.id,
		creatorAddress: row.creatorAddress ?? "0x0000000000000000000000000000000000000000",
		status: mapLaunchStatus(row.status),
		name: row.tokenName,
		symbol: row.tokenTicker,
		description: row.tokenDescription ?? "",
		...(row.tokenImageUrl ? { imageUrl: row.tokenImageUrl } : {}),
		...(website ? { website } : {}),
		...(twitter ? { twitter } : {}),
		...(telegram ? { telegram } : {}),
		quoteTokenSymbol: "BNB",
		taxRateBps: row.taxRate,
		...(row.inviteCode ? { inviteCode: row.inviteCode } : {}),
		metadataCid: extractMetadataCid(row.metadataUri),
		salt: saltToHex(row.salt),
		submitStrategy: "user-signed",
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function createMemoryDbClient(_config: AppConfig): DbClient {
	return {
		async ping() {
			return true;
		},
		async health() {
			return {
				ok: true,
				provider: "compat-memory-db",
				notes: ["In-memory compatibility repository enabled by DB_COMPAT=memory."],
			};
		},
		async listTokens(query) {
			const offset = query.offset ?? 0;
			const sort = query.sort ?? "trending";
			const lifecycle = query.lifecycle ?? "all";

			const filtered = listTokenSummaries()
				.filter((token) => {
					if (!filterByLifecycle(token, lifecycle)) return false;
					if (query.status && token.status !== query.status) return false;
					if (
						query.creatorAddress &&
						normalizeAddress(token.creatorAddress) !== normalizeAddress(query.creatorAddress)
					) {
						return false;
					}
					if (typeof query.featured === "boolean" && token.featured !== query.featured) {
						return false;
					}
					if (query.search) {
						const needle = query.search.toLowerCase();
						return (
							token.name.toLowerCase().includes(needle) ||
							token.symbol.toLowerCase().includes(needle) ||
							token.address.toLowerCase().includes(needle)
						);
					}
					return true;
				})
				.sort((left, right) => compareBySort(left, right, sort));

			const items = filtered.slice(offset, offset + query.limit);

			return {
				items,
				total: filtered.length,
				limit: query.limit,
				offset,
				page: Math.floor(offset / query.limit) + 1,
				hasMore: offset + items.length < filtered.length,
			} satisfies TokenListResult;
		},
		async getTokenByAddress(address) {
			return seededTokenDetails.find((token) => normalizeAddress(token.address) === normalizeAddress(address)) ?? null;
		},
		async listTokenTrades(query) {
			return seededTrades
				.filter((trade) => normalizeAddress(trade.tokenAddress) === normalizeAddress(query.address))
				.slice(0, query.limit);
		},
		async createLaunch(creatorAddress, input, options) {
			const now = new Date().toISOString();
			const id = `launch_${memoryLaunches.size + 1}`;
			const hasInvite = Boolean(input.inviteCode);
			const launch: LaunchRecord = {
				id,
				creatorAddress,
				status: options.curatedLaunchOnly && !hasInvite ? "pending" : "preparing",
				name: input.name,
				symbol: input.symbol,
				description: input.description,
				...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
				...(input.website ? { website: input.website } : {}),
				...(input.twitter ? { twitter: input.twitter } : {}),
				...(input.telegram ? { telegram: input.telegram } : {}),
				quoteTokenSymbol: "BNB",
				taxRateBps: input.taxRateBps,
				...(input.inviteCode ? { inviteCode: input.inviteCode } : {}),
				...(input.initialBuyBnb ? { initialBuyBnb: input.initialBuyBnb } : {}),
				metadataCid: null,
				salt: null,
				submitStrategy: "user-signed",
				createdAt: now,
				updatedAt: now,
			};

			memoryLaunches.set(id, launch);
			return launch;
		},
		async getLaunchById(id) {
			return memoryLaunches.get(id) ?? null;
		},
		async listAdminLaunches() {
			return [...memoryLaunches.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
		},
		async updateLaunchStatus(id, status) {
			const current = memoryLaunches.get(id);
			if (!current) return null;

			const nextStatus: LaunchStatus = status === "approved" ? "preparing" : status;

			const next: LaunchRecord = {
				...current,
				status: nextStatus,
				updatedAt: new Date().toISOString(),
			};

			memoryLaunches.set(id, next);
			return next;
		},
		async getCreatorProfile(address) {
			return memoryCreators.get(normalizeAddress(address)) ?? getDefaultProfile(address);
		},
		async updateCreatorProfile(address, input) {
			const key = normalizeAddress(address);
			const current = memoryCreators.get(key) ?? getDefaultProfile(address);
			const next: CreatorProfile = {
				...current,
				address,
				displayName: input.displayName ?? current.displayName,
				bio: input.bio ?? current.bio,
				twitter: input.twitter ?? current.twitter,
				telegram: input.telegram ?? current.telegram,
				website: input.website ?? current.website,
			};

			memoryCreators.set(key, next);
			return next;
		},
		async validateInviteCode(code) {
			const invite = memoryInviteCodesStore.get(code);
			if (!invite || !invite.isActive) {
				return { valid: false, reason: "Invalid invite code" };
			}
			if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
				return { valid: false, reason: "Invite code has expired" };
			}
			if (invite.usedCount >= invite.maxUses) {
				return { valid: false, reason: "Invite code has reached its usage limit" };
			}
			return { valid: true, remainingUses: invite.maxUses - invite.usedCount };
		},
		async createInviteCode(input) {
			const now = new Date().toISOString();
			const id = `invite_${memoryInviteCodesStore.size + 1}`;
			const record: InviteCodeRecord = {
				id,
				code: input.code,
				maxUses: input.maxUses,
				usedCount: 0,
				isActive: true,
				expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
				createdBy: input.createdByAddress,
				createdAt: now,
				updatedAt: now,
			};
			memoryInviteCodesStore.set(input.code, record);
			return record;
		},
		async listInviteCodes() {
			return [...memoryInviteCodesStore.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		},
		async getTokenChartData(_query: unknown) {
			return [];
		},
		async linkAgentToToken(_tokenAddress, _agentId) {},
	};
}

export function createDrizzleDbClient(config: AppConfig, db: Database): DbClient {
	const { tokens, trades, creators, launches, inviteCodes, inviteRedemptions } = dbSchema;

	function tokenProjection() {
		return {
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
		};
	}

	async function ensureCreator(client: any, address: string) {
		const normalizedAddress = normalizeAddress(address);
		const [existing] = await client
			.select({
				id: creators.id,
				evmAddress: creators.evmAddress,
				displayName: creators.displayName,
				twitterHandle: creators.twitterHandle,
				isVerified: creators.isVerified,
			})
			.from(creators)
			.where(sql`lower(${creators.evmAddress}) = ${normalizedAddress}`)
			.orderBy(
				sql`CASE WHEN ${creators.evmAddress} = ${normalizedAddress} THEN 0 ELSE 1 END`,
				desc(creators.isVerified),
				desc(creators.updatedAt),
				desc(creators.createdAt),
				asc(creators.evmAddress),
			)
			.limit(1);

		if (existing) return existing;

		const [inserted] = await client
			.insert(creators)
			.values({ evmAddress: normalizedAddress })
			.onConflictDoNothing({ target: creators.evmAddress })
			.returning({
				id: creators.id,
				evmAddress: creators.evmAddress,
				displayName: creators.displayName,
				twitterHandle: creators.twitterHandle,
				isVerified: creators.isVerified,
			});

		if (inserted) return inserted;

		const [retry] = await client
			.select({
				id: creators.id,
				evmAddress: creators.evmAddress,
				displayName: creators.displayName,
				twitterHandle: creators.twitterHandle,
				isVerified: creators.isVerified,
			})
			.from(creators)
			.where(sql`lower(${creators.evmAddress}) = ${normalizedAddress}`)
			.orderBy(
				sql`CASE WHEN ${creators.evmAddress} = ${normalizedAddress} THEN 0 ELSE 1 END`,
				desc(creators.isVerified),
				desc(creators.updatedAt),
				desc(creators.createdAt),
				asc(creators.evmAddress),
			)
			.limit(1);

		if (!retry) throw new Error("Failed to upsert creator");
		return retry;
	}

	function launchProjection() {
		return {
			id: launches.id,
			creatorAddress: creators.evmAddress,
			status: launches.status,
			tokenName: launches.tokenName,
			tokenTicker: launches.tokenTicker,
			tokenDescription: launches.tokenDescription,
			tokenImageUrl: launches.tokenImageUrl,
			socials: launches.socials,
			quoteToken: launches.quoteToken,
			taxRate: launches.taxRate,
			inviteCode: inviteCodes.code,
			metadataUri: launches.metadataUri,
			salt: launches.salt,
			createdAt: launches.createdAt,
			updatedAt: launches.updatedAt,
		};
	}

	return {
		async ping() {
			try {
				await db.execute(sql`SELECT 1`);
				return true;
			} catch {
				return false;
			}
		},
		async health() {
			const ok = await this.ping();
			return {
				ok,
				provider: "drizzle-postgres",
				...(ok ? {} : { notes: ["Database unreachable"] }),
			};
		},
		async listTokens(query) {
			const limit = query.limit;
			const offset = query.offset ?? Math.max((query.page ?? 1) - 1, 0) * limit;
			const page = Math.floor(offset / limit) + 1;
			const sort = query.sort ?? "trending";
			const lifecycle = query.lifecycle ?? "all";
			const conditions: SQL[] = [
				sql`t.chain_id = ${config.chain.chainId}`,
				sql`t.status IN ('active', 'migrating', 'migrated')`,
			];

			if (lifecycle === "bonding") {
				conditions.push(sql`t.status IN ('active', 'migrating')`);
			}
			if (lifecycle === "bonded") {
				conditions.push(sql`t.status = 'migrated'`);
			}
			if (query.status) {
				conditions.push(sql`t.status = ${mapApiTokenStatus(query.status)}`);
			}
			if (query.creatorAddress) {
				conditions.push(sql`lower(t.creator_address) = ${normalizeAddress(query.creatorAddress)}`);
			}
			if (typeof query.featured === "boolean") {
				conditions.push(sql`t.is_featured = ${query.featured}`);
			}
			if (query.search) {
				const needle = query.search.trim();
				const contains = `%${needle}%`;
				const prefix = `${needle.toLowerCase()}%`;
				conditions.push(sql`(
          to_tsvector('english', coalesce(t.name, '') || ' ' || coalesce(t.ticker, '') || ' ' || coalesce(t.contract_address, '')) @@ websearch_to_tsquery('english', ${needle})
          OR t.name ILIKE ${contains}
          OR t.ticker ILIKE ${contains}
          OR t.contract_address ILIKE ${prefix}
        )`);
			}

			const whereClause = sql.join(conditions, sql` AND `);
			const orderBy =
				sort === "marketCap"
					? sql`t.market_cap_usd DESC NULLS LAST, t.last_trade_at DESC NULLS LAST, t.created_at DESC, t.contract_address ASC`
					: sort === "new"
						? sql`t.created_at DESC, t.contract_address ASC`
						: sql`t.last_trade_at DESC NULLS LAST, t.volume_24h DESC NULLS LAST, t.market_cap_usd DESC NULLS LAST, t.created_at DESC, t.contract_address ASC`;
			const canonicalTokens = sql`
        WITH canonical_tokens AS (
          SELECT *
          FROM (
            SELECT
              raw_tokens.*,
              row_number() OVER (
                PARTITION BY raw_tokens.chain_id, lower(raw_tokens.contract_address)
                ORDER BY
                  raw_tokens.is_verified DESC,
                  raw_tokens.last_trade_at DESC NULLS LAST,
                  raw_tokens.updated_at DESC,
                  raw_tokens.created_at DESC,
                  raw_tokens.contract_address ASC
              ) AS rn
            FROM tokens raw_tokens
          ) ranked_tokens
          WHERE ranked_tokens.rn = 1
        )
      `;

			const [countRows, rows] = await Promise.all([
				db.execute<{ total: number }>(sql`
          ${canonicalTokens}
          SELECT count(*)::int AS total
          FROM canonical_tokens t
          WHERE ${whereClause}
        `),
				db.execute<Parameters<typeof mapTokenSummary>[0]>(sql`
          ${canonicalTokens}
          SELECT
            t.contract_address AS address,
            t.name,
            t.ticker AS symbol,
            t.status,
            t.creator_address AS "creatorAddress",
            t.current_price AS price,
            t.market_cap_usd AS "marketCap",
            t.curve_progress AS "curveProgress",
            t.curve_limit AS "curveLimit",
            t.created_at AS "createdAt",
            t.image_url AS image,
            t.chain_id AS "chainId",
            t.is_featured AS "isFeatured",
            t.description,
            t.volume_24h AS "volume24h",
            t.holder_count AS "holderCount",
            t.price_change_24h AS "priceChange24h",
            t.is_verified AS "isVerified",
            t.is_imported AS "isImported",
            t.launch_platform AS "launchPlatform",
            t.owner_claim_status AS "ownerClaimStatus",
            t.agent_status AS "agentStatus",
            t.last_trade_at AS "lastTradeAt"
          FROM canonical_tokens t
          WHERE ${whereClause}
          ORDER BY ${orderBy}
          LIMIT ${limit}
          OFFSET ${offset}
        `),
			]);

			const total = countRows[0]?.total ?? 0;
			const items = rows.map((row) =>
				mapTokenSummary({
					...row,
					createdAt: new Date(row.createdAt),
					lastTradeAt: row.lastTradeAt ? new Date(row.lastTradeAt) : null,
				}),
			);
			return {
				items,
				total,
				limit,
				offset,
				page,
				hasMore: offset + items.length < total,
			} satisfies TokenListResult;
		},
		async getTokenByAddress(address) {
			const normalizedAddress = normalizeAddress(address);
			const [row] = await db
				.select({
					...tokenProjection(),
					metadataUri: tokens.metadataUri,
					poolAddress: tokens.dexPoolAddress,
					agentId: tokens.agentId,
				})
				.from(tokens)
				.where(
					and(eq(tokens.chainId, config.chain.chainId), sql`lower(${tokens.contractAddress}) = ${normalizedAddress}`),
				)
				.orderBy(
					desc(tokens.isVerified),
					sql`${tokens.lastTradeAt} desc nulls last`,
					desc(tokens.updatedAt),
					desc(tokens.createdAt),
					asc(tokens.contractAddress),
				)
				.limit(1);

			return row ? mapTokenDetail(row) : null;
		},
		async listTokenTrades(query) {
			const rows = await db.execute<{
				id: bigint;
				tokenAddress: string;
				side: "buy" | "sell";
				traderAddress: string;
				amountIn: string;
				amountOut: string;
				txHash: string;
				blockNumber: bigint | string | number;
				timestamp: Date | string;
			}>(sql`
        SELECT
          tr.id,
          tr.token_address AS "tokenAddress",
          tr.side,
          tr.trader_address AS "traderAddress",
          tr.amount_in AS "amountIn",
          tr.amount_out AS "amountOut",
          tr.tx_hash AS "txHash",
          tr.block_number AS "blockNumber",
          tr.block_timestamp AS "timestamp"
        FROM trades tr
        LEFT JOIN (
          SELECT DISTINCT chain_id, lower(contract_address) AS address_lower
          FROM tokens
        ) token_match
          ON tr.chain_id = token_match.chain_id
          AND lower(tr.token_address) = token_match.address_lower
        WHERE tr.chain_id = ${config.chain.chainId}
          AND lower(tr.token_address) = ${normalizeAddress(query.address)}
        ORDER BY tr.block_timestamp DESC, tr.id DESC
        LIMIT ${query.limit}
      `);

			return rows.map((row) => ({
				id: row.id.toString(),
				tokenAddress: row.tokenAddress,
				side: row.side,
				traderAddress: row.traderAddress,
				amountIn: row.amountIn,
				amountOut: row.amountOut,
				txHash: row.txHash,
				blockNumber: Number(row.blockNumber),
				timestamp: new Date(row.timestamp).toISOString(),
			}));
		},
		async createLaunch(creatorAddress, input, options) {
			const normalizedAddress = normalizeAddress(creatorAddress);
			return db.transaction(async (tx) => {
				const creator = await ensureCreator(tx, normalizedAddress);

				let inviteCodeId: string | null = null;
				if (input.inviteCode) {
					const [invite] = await tx.execute<{
						id: string;
						maxUses: number;
						usedCount: number;
						expiresAt: Date | null;
					}>(sql`
            SELECT
              id,
              max_uses AS "maxUses",
              used_count AS "usedCount",
              expires_at AS "expiresAt"
            FROM invite_codes
            WHERE code = ${input.inviteCode}
              AND is_active = true
            FOR UPDATE
          `);

					if (invite && (!invite.expiresAt || invite.expiresAt >= new Date()) && invite.usedCount < invite.maxUses) {
						const [existingRedemption] = await tx
							.select({ creatorId: inviteRedemptions.creatorId })
							.from(inviteRedemptions)
							.innerJoin(creators, eq(inviteRedemptions.creatorId, creators.id))
							.where(
								and(
									eq(inviteRedemptions.inviteCodeId, invite.id),
									sql`lower(${creators.evmAddress}) = ${normalizedAddress}`,
								),
							)
							.limit(1);

						const [redemption] = existingRedemption
							? []
							: await tx
									.insert(inviteRedemptions)
									.values({ inviteCodeId: invite.id, creatorId: creator.id })
									.onConflictDoNothing()
									.returning({ inviteCodeId: inviteRedemptions.inviteCodeId });

						if (redemption) {
							await tx
								.update(inviteCodes)
								.set({ usedCount: sql`${inviteCodes.usedCount} + 1`, updatedAt: new Date() })
								.where(eq(inviteCodes.id, invite.id));
							inviteCodeId = invite.id;
						}
					}
				}

				const initialStatus = options.curatedLaunchOnly && !inviteCodeId ? "pending_review" : "preparing";
				const [launch] = await tx
					.insert(launches)
					.values({
						creatorId: creator.id,
						inviteCodeId,
						tokenName: input.name,
						tokenTicker: input.symbol,
						tokenImageUrl: input.imageUrl ?? null,
						tokenDescription: input.description,
						socials: buildSocials(input),
						chainId: config.chain.chainId,
						portalAddress: config.chain.portalAddress,
						quoteToken: config.chain.nativeQuoteTokenSymbol,
						taxRate: input.taxRateBps,
						status: initialStatus,
					})
					.returning({ id: launches.id });

				if (!launch) throw new Error("Failed to create launch");

				const [created] = await tx
					.select(launchProjection())
					.from(launches)
					.innerJoin(creators, eq(launches.creatorId, creators.id))
					.leftJoin(inviteCodes, eq(launches.inviteCodeId, inviteCodes.id))
					.where(eq(launches.id, launch.id))
					.limit(1);

				if (!created) throw new Error("Failed to read created launch");
				return {
					...mapLaunchRecord(created),
					...(input.initialBuyBnb ? { initialBuyBnb: input.initialBuyBnb } : {}),
				};
			});
		},
		async getLaunchById(id) {
			const [row] = await db
				.select(launchProjection())
				.from(launches)
				.innerJoin(creators, eq(launches.creatorId, creators.id))
				.leftJoin(inviteCodes, eq(launches.inviteCodeId, inviteCodes.id))
				.where(eq(launches.id, id))
				.limit(1);

			return row ? mapLaunchRecord(row) : null;
		},
		async listAdminLaunches() {
			const rows = await db
				.select(launchProjection())
				.from(launches)
				.innerJoin(creators, eq(launches.creatorId, creators.id))
				.leftJoin(inviteCodes, eq(launches.inviteCodeId, inviteCodes.id))
				.orderBy(desc(launches.createdAt));

			return rows.map(mapLaunchRecord);
		},
		async updateLaunchStatus(id, status) {
			const dbStatus = status === "approved" ? "preparing" : mapApiLaunchStatus(status);
			const [updated] = await db
				.update(launches)
				.set({ status: dbStatus, updatedAt: new Date() })
				.where(eq(launches.id, id))
				.returning({ id: launches.id });

			return updated ? this.getLaunchById(updated.id) : null;
		},
		async getCreatorProfile(address) {
			const normalizedAddress = normalizeAddress(address);
			const creator = await ensureCreator(db, normalizedAddress);

			if (!creator) return getDefaultProfile(normalizedAddress);
			return {
				address: creator.evmAddress ?? normalizedAddress,
				displayName: creator.displayName,
				bio: null,
				twitter: creator.twitterHandle,
				telegram: null,
				website: null,
				verified: creator.isVerified,
				featured: false,
			};
		},
		async updateCreatorProfile(address, input) {
			const normalizedAddress = normalizeAddress(address);
			const canonicalCreator = await ensureCreator(db, normalizedAddress);

			const updates: { displayName?: string; twitterHandle?: string; updatedAt: Date } = {
				updatedAt: new Date(),
			};
			if (input.displayName !== undefined) updates.displayName = input.displayName;
			if (input.twitter !== undefined) updates.twitterHandle = input.twitter;
			// bio/telegram/website are part of the API contract but do not exist in the current DB schema.

			const [creator] = await db.update(creators).set(updates).where(eq(creators.id, canonicalCreator.id)).returning({
				evmAddress: creators.evmAddress,
				displayName: creators.displayName,
				twitterHandle: creators.twitterHandle,
				isVerified: creators.isVerified,
			});

			if (!creator) return getDefaultProfile(normalizedAddress);
			return {
				address: creator.evmAddress ?? normalizedAddress,
				displayName: creator.displayName,
				bio: null,
				twitter: creator.twitterHandle,
				telegram: null,
				website: null,
				verified: creator.isVerified,
				featured: false,
			};
		},
		async validateInviteCode(code) {
			const [invite] = await db
				.select({
					maxUses: inviteCodes.maxUses,
					usedCount: inviteCodes.usedCount,
					isActive: inviteCodes.isActive,
					expiresAt: inviteCodes.expiresAt,
				})
				.from(inviteCodes)
				.where(eq(inviteCodes.code, code))
				.limit(1);

			if (!invite || !invite.isActive) {
				return { valid: false, reason: "Invalid invite code" };
			}
			if (invite.expiresAt && invite.expiresAt < new Date()) {
				return { valid: false, reason: "Invite code has expired" };
			}
			if (invite.usedCount >= invite.maxUses) {
				return { valid: false, reason: "Invite code has reached its usage limit" };
			}
			return { valid: true, remainingUses: invite.maxUses - invite.usedCount };
		},
		async createInviteCode(input) {
			const normalizedAddress = normalizeAddress(input.createdByAddress);
			const creator = await ensureCreator(db, normalizedAddress);

			const [invite] = await db
				.insert(inviteCodes)
				.values({
					code: input.code,
					maxUses: input.maxUses,
					createdBy: creator.id,
					expiresAt: input.expiresAt ?? null,
					isActive: true,
				})
				.returning({
					id: inviteCodes.id,
					code: inviteCodes.code,
					maxUses: inviteCodes.maxUses,
					usedCount: inviteCodes.usedCount,
					isActive: inviteCodes.isActive,
					expiresAt: inviteCodes.expiresAt,
					createdAt: inviteCodes.createdAt,
					updatedAt: inviteCodes.updatedAt,
				});

			if (!invite) throw new Error("Failed to create invite code");
			return {
				id: invite.id,
				code: invite.code,
				maxUses: invite.maxUses,
				usedCount: invite.usedCount,
				isActive: invite.isActive,
				expiresAt: invite.expiresAt?.toISOString() ?? null,
				createdBy: creator.evmAddress ?? normalizedAddress,
				createdAt: invite.createdAt.toISOString(),
				updatedAt: invite.updatedAt.toISOString(),
			};
		},
		async listInviteCodes() {
			const rows = await db
				.select({
					id: inviteCodes.id,
					code: inviteCodes.code,
					maxUses: inviteCodes.maxUses,
					usedCount: inviteCodes.usedCount,
					isActive: inviteCodes.isActive,
					expiresAt: inviteCodes.expiresAt,
					createdBy: creators.evmAddress,
					createdAt: inviteCodes.createdAt,
					updatedAt: inviteCodes.updatedAt,
				})
				.from(inviteCodes)
				.innerJoin(creators, eq(inviteCodes.createdBy, creators.id))
				.orderBy(desc(inviteCodes.createdAt));

			return rows.map((invite) => ({
				id: invite.id,
				code: invite.code,
				maxUses: invite.maxUses,
				usedCount: invite.usedCount,
				isActive: invite.isActive,
				expiresAt: invite.expiresAt?.toISOString() ?? null,
				createdBy: invite.createdBy ?? "",
				createdAt: invite.createdAt.toISOString(),
				updatedAt: invite.updatedAt.toISOString(),
			}));
		},
		async getTokenChartData(query) {
			const bucket = bucketExpr(query.interval);
			const rows = await db.execute<{
				bucket: Date | string;
				open: string;
				high: string;
				low: string;
				close: string;
				volume: string;
			}>(sql`
        SELECT
          ${sql.raw(bucket)} AS bucket,
          (array_agg(price ORDER BY block_timestamp ASC))[1] AS open,
          max(price) AS high,
          min(price) AS low,
          (array_agg(price ORDER BY block_timestamp DESC))[1] AS close,
          coalesce(sum(usd_value), 0) AS volume
        FROM trades
        WHERE chain_id = ${config.chain.chainId}
          AND lower(token_address) = ${normalizeAddress(query.address)}
          AND block_timestamp >= ${query.from.toISOString()}::timestamptz
          AND block_timestamp <= ${query.to.toISOString()}::timestamptz
          AND price IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket ASC
        LIMIT ${query.limit}
      `);

			return rows.map((row) => ({
				timestamp: new Date(row.bucket).toISOString(),
				open: Number(row.open),
				high: Number(row.high),
				low: Number(row.low),
				close: Number(row.close),
				volume: Number(row.volume),
			})) satisfies CandleRecord[];
		},
		async linkAgentToToken(tokenAddress, agentId) {
			await db
				.update(tokens)
				.set({ agentId, agentStatus: "provisioning", updatedAt: new Date() })
				.where(
					and(
						eq(tokens.chainId, config.chain.chainId),
						sql`lower(${tokens.contractAddress}) = ${normalizeAddress(tokenAddress)}`,
					),
				);
		},
	};
}

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

export function createDbClient(config: AppConfig): DbClient {
	if (process.env.DB_COMPAT === "memory") {
		return createMemoryDbClient(config);
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required unless DB_COMPAT=memory");
	}

	return createDrizzleDbClient(config, getDatabase(databaseUrl).db);
}
