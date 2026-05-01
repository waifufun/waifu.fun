import { numeric, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const stakingPositions = pgTable(
	"staking_positions",
	{
		id: serial("id").primaryKey(),
		walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
		stakedAmount: numeric("staked_amount", { precision: 78, scale: 0 }).notNull().default("0"),
		earnedRewards: numeric("earned_rewards", { precision: 78, scale: 0 }).notNull().default("0"),
		lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		walletUnique: uniqueIndex("staking_wallet_unique").on(table.walletAddress),
	}),
);
