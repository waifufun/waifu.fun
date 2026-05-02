import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const launchpadWaitlist = pgTable(
	"launchpad_waitlist",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		email: text("email").notNull(),
		launchpadId: text("launchpad_id").notNull(),
		signedUpAt: timestamp("signed_up_at", { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		emailLaunchpadUnique: uniqueIndex("launchpad_waitlist_email_launchpad_id_unique").on(
			table.email,
			table.launchpadId,
		),
	}),
);

export type LaunchpadWaitlistRow = typeof launchpadWaitlist.$inferSelect;
export type NewLaunchpadWaitlist = typeof launchpadWaitlist.$inferInsert;
