import { sql } from "drizzle-orm";
import { bigserial, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import type { JsonMap } from "./_common.js";

export const navSnapshots = pgTable(
	"nav_snapshots",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		agentTokenAddress: text("agent_token_address").notNull(),
		snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
		navUsd: numeric("nav_usd").notNull(),
		pricedNavUsd: numeric("priced_nav_usd"),
		unpricedCount: integer("unpriced_count").notNull().default(0),
		byChain: jsonb("by_chain").$type<JsonMap>(),
		byRole: jsonb("by_role").$type<JsonMap>(),
		walletCount: integer("wallet_count").notNull().default(0),
		holdingsCount: integer("holdings_count").notNull().default(0),
		source: text("source"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		idxAgentTime: index("idx_nav_snapshots_agent_time").on(table.agentTokenAddress, table.snapshotAt.desc()),
		uniqAgentHour: uniqueIndex("uniq_nav_snapshots_agent_hour").on(
			table.agentTokenAddress,
			sql`date_trunc('hour', ${table.snapshotAt} at time zone 'UTC')`,
		),
	}),
);

export type NavSnapshotRow = typeof navSnapshots.$inferSelect;
export type NewNavSnapshot = typeof navSnapshots.$inferInsert;
