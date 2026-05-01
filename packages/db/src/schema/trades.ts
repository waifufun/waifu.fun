import { sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { events } from "./events.js";

export const tradeSideEnum = pgEnum("trade_side", ["buy", "sell"]);

export const trades = pgTable(
	"trades",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		eventId: bigint("event_id", { mode: "bigint" })
			.notNull()
			.references(() => events.id),
		chainId: integer("chain_id").notNull(),
		tokenAddress: text("token_address").notNull(),
		traderAddress: text("trader_address").notNull(),
		side: tradeSideEnum("side").notNull(),
		amountIn: numeric("amount_in").notNull(),
		amountOut: numeric("amount_out").notNull(),
		price: numeric("price"),
		usdValue: numeric("usd_value"),
		txHash: text("tx_hash").notNull(),
		blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
		blockTimestamp: timestamp("block_timestamp", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		chainTxEventUq: uniqueIndex("trades_chain_tx_event_uq").on(table.chainId, table.txHash, table.eventId),
		tokenTimeIdx: index("idx_trades_token_time").on(table.tokenAddress, sql`${table.blockTimestamp} desc`),
		traderIdx: index("idx_trades_trader").on(table.traderAddress, sql`${table.blockTimestamp} desc`),
		tokenSideIdx: index("idx_trades_token_side").on(table.tokenAddress, table.side, sql`${table.blockTimestamp} desc`),
	}),
);
