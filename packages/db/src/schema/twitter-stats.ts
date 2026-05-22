import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const twitterStats = pgTable("twitter_stats", {
	handle: text("handle").primaryKey(),
	followers: integer("followers"),
	following: integer("following"),
	tweets: integer("tweets"),
	source: text("source"),
	fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

export type TwitterStatsRow = typeof twitterStats.$inferSelect;
export type NewTwitterStats = typeof twitterStats.$inferInsert;
