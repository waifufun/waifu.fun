import { sql } from "drizzle-orm";
import { bigint, boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const creatorAdminRoleEnum = pgEnum("creator_admin_role", ["super_admin", "admin", "moderator"]);

export const creators = pgTable(
	"creators",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		evmAddress: text("evm_address").unique(),
		solanaAddress: text("solana_address").unique(),
		displayName: text("display_name"),
		avatarUrl: text("avatar_url"),
		twitterHandle: text("twitter_handle"),
		isVerified: boolean("is_verified").notNull().default(false),
		isSuspended: boolean("is_suspended").notNull().default(false),
		adminRole: creatorAdminRoleEnum("admin_role"),
		adminPerms: text("admin_perms").array(),
		stewardUserId: text("steward_user_id").unique(),
		points: bigint("points", { mode: "bigint" }).notNull().default(sql`0`),
		weeklyPoints: bigint("weekly_points", { mode: "bigint" }).notNull().default(sql`0`),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		evmAddressIdx: index("idx_creators_evm").on(table.evmAddress).where(sql`${table.evmAddress} is not null`),
		solanaAddressIdx: index("idx_creators_solana")
			.on(table.solanaAddress)
			.where(sql`${table.solanaAddress} is not null`),
		adminRoleIdx: index("idx_creators_admin").on(table.adminRole).where(sql`${table.adminRole} is not null`),
		stewardUserIdIdx: index("idx_creators_steward_user")
			.on(table.stewardUserId)
			.where(sql`${table.stewardUserId} is not null`),
	}),
);
