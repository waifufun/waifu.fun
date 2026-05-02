import { bigint, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { events } from "./events.js";

export const migrationStatusEnum = pgEnum("migration_status", ["pending", "migrating", "migrated", "failed"]);

export const dexMigrations = pgTable(
	"dex_migrations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		chainId: integer("chain_id").notNull(),
		tokenAddress: text("token_address").notNull(),
		dexName: text("dex_name"),
		poolAddress: text("pool_address"),
		lpTokenAddress: text("lp_token_address"),
		migrationTxHash: text("migration_tx_hash"),
		migrationBlock: bigint("migration_block", { mode: "bigint" }),
		baseAmount: numeric("base_amount"),
		quoteAmount: numeric("quote_amount"),
		status: migrationStatusEnum("status").notNull().default("pending"),
		eventId: bigint("event_id", { mode: "bigint" }).references(() => events.id),
		migratedAt: timestamp("migrated_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		chainTokenUq: uniqueIndex("dex_migrations_chain_token_uq").on(table.chainId, table.tokenAddress),
	}),
);
