/**
 * Audit trail + idempotency ledger for the autonomous BNB->credits off-ramp.
 *
 * Every auto-mint attempt (detected BSC deposit -> directWallet create+confirm ->
 * Eliza Cloud org credits) writes a row here. The table is the single source of
 * truth for:
 *   - IDEMPOTENCY: a unique constraint on `deposit_tx_hash` guarantees a given
 *     on-chain deposit can never double-mint, even across watcher restarts /
 *     concurrent ticks.
 *   - DAILY SPEND CAP: the watcher sums `usd_amount` for rows in the current UTC
 *     day with a credited/pending status to enforce MAX_AUTO_CREDITS_USD_PER_DAY.
 *   - AUDIT: amount, tx hashes, resulting balance, and terminal status for every
 *     auto-mint, plus the rows that were `capped` (refused for exceeding a limit)
 *     so the decision is legible after the fact.
 *
 * See `0041_credit_offramp_mints.sql` for the physical table.
 */

import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const creditOfframpMintStatuses = [
	// Detected + accepted under the caps; conversion not yet confirmed.
	"pending",
	// Eliza Cloud confirmed the directWallet payment; credits minted to the org.
	"credited",
	// Refused because it would exceed a per-tx / per-day / global limit.
	"capped",
	// Killed by the global kill-switch (env flag or pause file).
	"killed",
	// The convert call failed (provider/network error); safe to retry later.
	"failed",
	// Skipped: off-ramp not automatable (no session secret/token configured).
	"skipped",
] as const;
export type CreditOfframpMintStatus = (typeof creditOfframpMintStatuses)[number];

export const creditOfframpMints = pgTable(
	"credit_offramp_mints",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		/** The inbound BSC deposit tx hash that triggered this mint (idempotency key). */
		depositTxHash: text("deposit_tx_hash").notNull(),
		/** Agent token address whose Safe received the deposit (lowercased). */
		agentTokenAddress: text("agent_token_address"),
		/** The agent Safe (or funding address) that received the deposit (lowercased). */
		safeAddress: text("safe_address"),
		/** Deposit asset that triggered this mint. */
		asset: text("asset", { enum: ["BNB", "USDT"] })
			.notNull()
			.default("BNB"),
		/** BNB amount of the originating deposit, when the asset is native BNB. */
		depositBnb: numeric("deposit_bnb"),
		/** BNB amount actually routed to the off-ramp (the creditsShare slice), when BNB. */
		convertBnb: numeric("convert_bnb"),
		/** USD value of the converted slice at the price snapshot, or USDT amount 1:1. */
		usdAmount: numeric("usd_amount").notNull(),
		/** BNB->USD price snapshot at conversion time; null for USD-native stablecoins. */
		bnbPriceUsd: numeric("bnb_price_usd"),
		/** The BNB transfer tx hash sent to the Eliza Cloud receive address (the off-ramp leg). */
		offrampTxHash: text("offramp_tx_hash"),
		/** Eliza Cloud payment id from createCryptoPayment. */
		elizaPaymentId: text("eliza_payment_id"),
		/** Credits added per the confirm response (string to avoid float drift). */
		creditsAdded: text("credits_added"),
		/** Org credit balance read AFTER a successful mint (audit). */
		resultingBalance: text("resulting_balance"),
		status: text("status", { enum: creditOfframpMintStatuses }).notNull().default("pending"),
		/** Why a row is `capped`/`killed`/`failed`/`skipped` (legibility). */
		reason: text("reason"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
	},
	(table) => ({
		// Idempotency: at most ONE in-flight (pending) or successful (credited) row
		// per originating deposit, hard-enforced by a PARTIAL unique index. Refusal /
		// failure rows (capped/killed/skipped/failed) are intentionally NOT covered,
		// so a deposit that was paused by the kill-switch, skipped on a transient
		// price outage, or failed mid-convert can be RETRIED on a later tick without
		// being mistaken for a completed mint. (See 0041 migration for the WHERE.)
		uniqueActiveDeposit: uniqueIndex("credit_offramp_mints_active_deposit_unique")
			.on(table.depositTxHash)
			.where(sql`${table.status} IN ('pending', 'credited')`),
		byDepositTxHash: index("credit_offramp_mints_by_deposit_tx_hash").on(table.depositTxHash),
		byCreatedAt: index("credit_offramp_mints_by_created_at").on(table.createdAt),
		byStatus: index("credit_offramp_mints_by_status").on(table.status),
		byAsset: index("credit_offramp_mints_by_asset").on(table.asset),
		byAgent: index("credit_offramp_mints_by_agent").on(table.agentTokenAddress),
		assetCheck: check("credit_offramp_mints_asset_check", sql`${table.asset} IN ('BNB', 'USDT')`),
		statusCheck: check(
			"credit_offramp_mints_status_check",
			sql`${table.status} IN ('pending', 'credited', 'capped', 'killed', 'failed', 'skipped')`,
		),
	}),
);

export type CreditOfframpMintRow = typeof creditOfframpMints.$inferSelect;
export type NewCreditOfframpMint = typeof creditOfframpMints.$inferInsert;
