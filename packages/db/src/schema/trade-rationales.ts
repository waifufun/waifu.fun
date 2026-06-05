import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const tradeRationales = pgTable(
	"trade_rationales",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: varchar("agent_id", { length: 128 }).notNull(),
		coin: text("coin").notNull(),
		side: text("side").$type<"long" | "short" | null>(),
		action: text("action").$type<"open" | "close" | null>(),
		reason: text("reason").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		consumedAt: timestamp("consumed_at", { withTimezone: true }),
	},
	(table) => ({
		agentCoinCreatedIdx: index("idx_trade_rationales_agent_coin_created").on(
			table.agentId,
			table.coin,
			table.createdAt.desc(),
		),
	}),
);

export type TradeRationale = typeof tradeRationales.$inferSelect;
export type NewTradeRationale = typeof tradeRationales.$inferInsert;
