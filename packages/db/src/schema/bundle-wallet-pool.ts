import { sql } from "drizzle-orm";
import { boolean, index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bundleWalletPool = pgTable(
	"bundle_wallet_pool",
	{
		address: text("address").primaryKey(),
		encryptedPk: text("encrypted_pk").notNull(),
		lastCreateTs: timestamp("last_create_ts", { withTimezone: true }),
		nextAvailableTs: timestamp("next_available_ts", { withTimezone: true }),
		balanceBnb: numeric("balance_bnb", { precision: 38, scale: 18 }).default("0"),
		isActive: boolean("is_active").notNull().default(true),
		notes: text("notes"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		availableIdx: index("idx_bundle_wallet_pool_available")
			.on(table.nextAvailableTs)
			.where(sql`${table.isActive} = true`),
	}),
);

export type BundleWalletPoolRow = typeof bundleWalletPool.$inferSelect;
export type NewBundleWalletPoolRow = typeof bundleWalletPool.$inferInsert;
