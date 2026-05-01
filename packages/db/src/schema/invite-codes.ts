import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { creators } from "./creators.js";

export const inviteCodes = pgTable(
	"invite_codes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		code: text("code").notNull().unique(),
		maxUses: integer("max_uses").notNull(),
		usedCount: integer("used_count").notNull().default(0),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => creators.id),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		maxUsesCheck: check("invite_codes_max_uses_check", sql`${table.maxUses} >= 1`),
		usedCountCheck: check("invite_codes_used_count_check", sql`${table.usedCount} >= 0`),
		activeIdx: index("idx_invite_active").on(table.isActive, table.expiresAt),
	}),
);

export const inviteRedemptions = pgTable(
	"invite_redemptions",
	{
		inviteCodeId: uuid("invite_code_id")
			.notNull()
			.references(() => inviteCodes.id),
		creatorId: uuid("creator_id")
			.notNull()
			.references(() => creators.id),
		redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.inviteCodeId, table.creatorId] }),
	}),
);
