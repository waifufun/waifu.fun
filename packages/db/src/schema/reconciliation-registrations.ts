import { index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * $WAIFU wind-down reconciliation registrations.
 *
 * The token was sunset 2026-06-26; the agent treasury sale proceeds are being
 * distributed back to holders pro-rata (net of BNB already realized by selling).
 * During the registration window, eligible holders connect + sign a message to
 * book their spot and confirm the destination wallet. This table records those
 * signed attestations. The merkle claim contract built after the window settles
 * payouts; this is the off-chain booking record, with a verified signature.
 */
export const reconciliationRegistrations = pgTable(
	"reconciliation_registrations",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		/** Lowercased EVM address that signed (and the payout destination). */
		address: text("address").notNull(),
		/** Eligible amount in BNB at registration time, from the snapshot analysis. */
		amountBnb: numeric("amount_bnb").notNull(),
		/** The exact message that was signed (EIP-191 personal_sign). */
		message: text("message").notNull(),
		/** The 65-byte hex signature. Verified server-side to recover `address`. */
		signature: text("signature").notNull(),
		/** Snapshot block the eligibility was computed at (audit anchor). */
		snapshotBlock: integer("snapshot_block").notNull(),
		registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => ({
		addressUnique: uniqueIndex("reconciliation_registrations_address_unique").on(table.address),
		registeredAtIdx: index("reconciliation_registrations_registered_at_idx").on(table.registeredAt),
	}),
);

export type ReconciliationRegistration = typeof reconciliationRegistrations.$inferSelect;
export type NewReconciliationRegistration = typeof reconciliationRegistrations.$inferInsert;
