import { sql } from "drizzle-orm";
import { bigserial, index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tokenSnapshots = pgTable(
	"token_snapshots",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		chainId: integer("chain_id").notNull(),
		tokenAddress: text("token_address").notNull(),
		price: numeric("price"),
		marketCapUsd: numeric("market_cap_usd"),
		volumePeriod: numeric("volume_period"),
		holderCount: integer("holder_count"),
		curveProgress: numeric("curve_progress"),
		reserveAmount: numeric("reserve_amount"),
		snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
		periodSeconds: integer("period_seconds").notNull().default(300),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		tokenTimeIdx: index("idx_snapshots_token_time").on(table.tokenAddress, sql`${table.snapshotAt} desc`),
		timeIdx: index("idx_snapshots_time").on(sql`${table.snapshotAt} desc`),
	}),
);
