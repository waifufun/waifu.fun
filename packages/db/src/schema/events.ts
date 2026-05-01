import { sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { type JsonMap, emptyJsonObject, pgBytea } from "./_common.js";

export const flapEventTypeEnum = pgEnum("flap_event_type", [
	"TokenCreated",
	"TokenBought",
	"TokenSold",
	"FlapTokenProgressChanged",
	"LaunchedToDEX",
	// V2 event types (legacy, kept so historical rows still validate)
	"SwapExecuted",
	"CurveGraduated",
	"LPLocked",
	"FeesDistributed",
	"Staked",
	"Withdrawn",
	"RewardClaimed",
	"RewardNotified",
	"AgentCreated",
	// Four.Meme event types (current primary source)
	"TokenCreate",
	"TokenPurchase",
	"TokenSale",
	"LiquidityAdded",
	"TradeStop",
	"NftAdded",
	"NftRemoved",
]);

export const events = pgTable(
	"events",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		chainId: integer("chain_id").notNull(),
		blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
		txHash: text("tx_hash").notNull(),
		logIndex: integer("log_index").notNull(),
		eventType: flapEventTypeEnum("event_type").notNull(),
		portalAddress: text("portal_address").notNull(),
		tokenAddress: text("token_address"),
		actorAddress: text("actor_address"),
		payload: jsonb("payload").$type<JsonMap>().notNull().default(emptyJsonObject),
		rawTopics: text("raw_topics").array(),
		rawData: pgBytea("raw_data"),
		blockTimestamp: timestamp("block_timestamp", { withTimezone: true }).notNull(),
		indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
		processed: boolean("processed").notNull().default(false),
		processError: text("process_error"),
	},
	(table) => ({
		chainTxLogUq: uniqueIndex("events_chain_tx_log_uq").on(table.chainId, table.txHash, table.logIndex),
		tokenIdx: index("idx_events_token").on(table.tokenAddress, table.blockNumber),
		typeIdx: index("idx_events_type").on(table.eventType, table.blockNumber),
		actorIdx: index("idx_events_actor")
			.on(table.actorAddress, sql`${table.blockNumber} desc`)
			.where(sql`${table.actorAddress} is not null`),
		blockIdx: index("idx_events_block").on(table.chainId, table.blockNumber),
		unprocessedIdx: index("idx_events_unprocessed")
			.on(table.processed, table.id)
			.where(sql`${table.processed} = false`),
		timestampIdx: index("idx_events_timestamp").on(sql`${table.blockTimestamp} desc`),
	}),
);
