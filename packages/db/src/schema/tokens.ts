import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { type JsonMap, emptyJsonObject } from "./_common.js";
import { creators } from "./creators.js";
import { launches } from "./launches.js";

export const tokenStatusEnum = pgEnum("token_status", ["active", "migrating", "migrated", "hidden", "delisted"]);

export const tokens = pgTable(
	"tokens",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		chainId: integer("chain_id").notNull(),
		contractAddress: text("contract_address").notNull(),
		name: text("name").notNull(),
		ticker: text("ticker").notNull(),
		imageUrl: text("image_url"),
		description: text("description"),
		metadataUri: text("metadata_uri"),
		socials: jsonb("socials").$type<JsonMap>().notNull().default(emptyJsonObject),
		creatorAddress: text("creator_address").notNull(),
		creatorId: uuid("creator_id").references(() => creators.id),
		launchId: uuid("launch_id").references(() => launches.id),
		launchPlatform: text("launch_platform").notNull().default("flap"),
		portalAddress: text("portal_address"),
		decimals: integer("decimals").notNull().default(18),
		totalSupply: numeric("total_supply").notNull(),
		taxRate: integer("tax_rate").notNull().default(0),
		isTaxToken: boolean("is_tax_token").notNull().default(false),
		bondingCurveAddr: text("bonding_curve_addr"),
		curveProgress: numeric("curve_progress"),
		curveLimit: numeric("curve_limit"),
		reserveAmount: numeric("reserve_amount"),
		virtualReserves: numeric("virtual_reserves"),
		currentPrice: numeric("current_price"),
		marketCapUsd: numeric("market_cap_usd"),
		tokenPriceUsd: numeric("token_price_usd"),
		volume24h: numeric("volume_24h").notNull().default("0"),
		priceChange24h: numeric("price_change_24h"),
		holderCount: integer("holder_count").notNull().default(0),
		dexPoolAddress: text("dex_pool_address"),
		migratedAt: timestamp("migrated_at", { withTimezone: true }),
		status: tokenStatusEnum("status").notNull().default("active"),
		isFeatured: boolean("is_featured").notNull().default(false),
		isVerified: boolean("is_verified").notNull().default(false),
		isImported: boolean("is_imported").notNull().default(false),
		agentId: uuid("agent_id"),
		agentStatus: text("agent_status").notNull().default("none"),
		ownerClaimStatus: text("owner_claim_status").notNull().default("unclaimed"),
		lastTradeAt: timestamp("last_trade_at", { withTimezone: true }),
		lastPriceUpdate: timestamp("last_price_update", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		chainContractUq: uniqueIndex("tokens_chain_contract_uq").on(table.chainId, table.contractAddress),
		statusMarketIdx: index("idx_tokens_status_market").on(table.status, sql`${table.marketCapUsd} desc nulls last`),
		statusVolumeIdx: index("idx_tokens_status_volume").on(table.status, sql`${table.volume24h} desc`),
		statusCreatedIdx: index("idx_tokens_status_created").on(table.status, sql`${table.createdAt} desc`),
		creatorAddressIdx: index("idx_tokens_creator_addr").on(table.creatorAddress),
		creatorIdIdx: index("idx_tokens_creator_id").on(table.creatorId).where(sql`${table.creatorId} is not null`),
		featuredIdx: index("idx_tokens_featured")
			.on(table.isFeatured, sql`${table.createdAt} desc`)
			.where(sql`${table.isFeatured} = true`),
		searchIdx: index("idx_tokens_search").using(
			"gin",
			sql`to_tsvector('english', coalesce(${table.name}, '') || ' ' || coalesce(${table.ticker}, '') || ' ' || coalesce(${table.contractAddress}, ''))`,
		),
		lastTradeIdx: index("idx_tokens_last_trade").on(sql`${table.lastTradeAt} desc nulls last`),
		agentIdx: index("idx_tokens_agent").on(table.agentId).where(sql`${table.agentId} is not null`),
	}),
);
