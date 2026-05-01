import { sql } from "drizzle-orm";
import { bigint, boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const indexerCursors = pgTable(
	"indexer_cursors",
	{
		id: text("id").primaryKey(),
		chainId: integer("chain_id").notNull(),
		contractAddress: text("contract_address").notNull(),
		lastBlock: bigint("last_block", { mode: "bigint" }).notNull().default(sql`0`),
		lastBlockTime: timestamp("last_block_time", { withTimezone: true }),
		backfillFrom: bigint("backfill_from", { mode: "bigint" }),
		backfillTo: bigint("backfill_to", { mode: "bigint" }),
		backfillCurrent: bigint("backfill_current", { mode: "bigint" }),
		backfillDone: boolean("backfill_done").notNull().default(false),
		lastPollAt: timestamp("last_poll_at", { withTimezone: true }),
		errorCount: integer("error_count").notNull().default(0),
		lastError: text("last_error"),
		isActive: boolean("is_active").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		chainContractUq: uniqueIndex("idx_cursors_chain_contract").on(table.chainId, table.contractAddress),
	}),
);
