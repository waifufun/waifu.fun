import { bigint, numeric, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const feeDistributions = pgTable(
	"fee_distributions",
	{
		id: serial("id").primaryKey(),
		agentToken: varchar("agent_token", { length: 42 }).notNull(),
		totalAmount: numeric("total_amount", { precision: 78, scale: 0 }).notNull(),
		agentShare: numeric("agent_share", { precision: 78, scale: 0 }).notNull(),
		platformShare: numeric("platform_share", { precision: 78, scale: 0 }).notNull(),
		stakerShare: numeric("staker_share", { precision: 78, scale: 0 }).notNull(),
		txHash: varchar("tx_hash", { length: 66 }).notNull(),
		blockNumber: bigint("block_number", { mode: "number" }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		txHashUnique: uniqueIndex("fee_dist_tx_unique").on(table.txHash),
	}),
);
