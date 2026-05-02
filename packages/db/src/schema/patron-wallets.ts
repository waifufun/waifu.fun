import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { patronUsers } from "./patron-users.js";

export const patronWallets = pgTable(
	"patron_wallets",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		patronId: uuid("patron_id")
			.notNull()
			.references(() => patronUsers.id, { onDelete: "cascade" }),
		/** Lowercased EVM address. One wallet can belong to only one patron in v1. */
		address: text("address").notNull(),
		/** BSC mainnet by default. */
		chainId: integer("chain_id").notNull().default(56),
		linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
		isPrimary: boolean("is_primary").notNull().default(false),
	},
	(table) => ({
		patronAddressUnique: uniqueIndex("patron_wallets_patron_address_unique").on(table.patronId, table.address),
		addressUnique: uniqueIndex("patron_wallets_address_unique").on(table.address),
	}),
);

export type PatronWallet = typeof patronWallets.$inferSelect;
export type NewPatronWallet = typeof patronWallets.$inferInsert;
