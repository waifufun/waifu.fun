import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { patronUsers } from "./patron-users.js";

/**
 * Opaque session tokens for patron (X/Twitter) users.
 * Stored HttpOnly in cookies; never in localStorage or JWTs.
 */
export const patronSessions = pgTable(
	"patron_sessions",
	{
		/** 32-byte random token, base64url encoded (session cookie value). */
		id: text("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => patronUsers.id, { onDelete: "cascade" }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		userIdIdx: index("idx_patron_sessions_user_id").on(table.userId),
		expiresAtIdx: index("idx_patron_sessions_expires_at").on(table.expiresAt),
	}),
);

export type PatronSession = typeof patronSessions.$inferSelect;
export type NewPatronSession = typeof patronSessions.$inferInsert;
