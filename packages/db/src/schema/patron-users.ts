import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Human users who sign in with X (Twitter) to become patrons.
 * Separate from `creators` (wallet-based auth) — this is cookie-session auth.
 */
export const patronUsers = pgTable(
	"patron_users",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		xUserId: text("x_user_id").unique().notNull(),
		xHandle: text("x_handle").notNull(),
		stewardUserId: text("steward_user_id").unique(),
		primaryEmail: text("primary_email"),
		xDisplayName: text("x_display_name"),
		xAvatarUrl: text("x_avatar_url"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		xUserIdIdx: index("idx_patron_users_x_user_id").on(table.xUserId),
		stewardUserIdIdx: index("idx_patron_users_steward_user_id").on(table.stewardUserId),
	}),
);

export type PatronUser = typeof patronUsers.$inferSelect;
export type NewPatronUser = typeof patronUsers.$inferInsert;
