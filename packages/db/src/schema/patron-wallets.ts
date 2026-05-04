import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
		/** BSC mainnet by default for EVM wallets. Solana primary wallets use 0. */
		chainId: integer("chain_id").notNull().default(56),
		/** Wallet chain namespace from Steward. */
		chainNamespace: text("chain_namespace").notNull().default("evm"),
		/** Wallet role in the patron identity model. */
		kind: text("kind").notNull().default("linked_eoa"),
		/** Canonical add timestamp for W10 routes. Mirrors linked_at for older callers. */
		addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
		linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		label: text("label"),
		isPrimary: boolean("is_primary").notNull().default(false),
	},
	(table) => ({
		patronAddressUnique: uniqueIndex("patron_wallets_patron_address_unique").on(table.patronId, table.address),
		addressUnique: uniqueIndex("patron_wallets_address_unique").on(table.address),
		patronKindIdx: index("patron_wallets_patron_kind_idx").on(table.patronId, table.kind),
		patronChainIdx: index("patron_wallets_patron_chain_idx").on(table.patronId, table.chainNamespace),
	}),
);

export type PatronWallet = typeof patronWallets.$inferSelect;
export type NewPatronWallet = typeof patronWallets.$inferInsert;
