/**
 * Audit log of patron top-up flows through Li.Fi.
 *
 * Every quote returned to the widget is persisted with status='quoted'.
 * When the patron broadcasts the tx, the row moves to 'submitted'/'pending'
 * and is updated by /v1/status polls until it terminates (completed /
 * partial / refunded / failed). See `0035_lifi_topup_events.sql` for the
 * physical table and full status lifecycle.
 *
 * Phase 2 MVP (patron-signed only). The Steward vault does NOT sign these
 * rows; they are pure audit + dashboard correlation. Phase 3+ adds vault
 * signing and the same status lifecycle applies.
 */

import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const topupEventStatuses = [
	"quoted",
	"submitted",
	"pending",
	"completed",
	"partial",
	"refunded",
	"failed",
] as const;
export type TopupEventStatus = (typeof topupEventStatuses)[number];

export const topupEvents = pgTable(
	"topup_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentTokenAddress: text("agent_token_address").notNull(),
		patronAddress: text("patron_address"),
		fromChain: integer("from_chain").notNull(),
		fromToken: text("from_token").notNull(),
		fromAmount: text("from_amount").notNull(),
		toChain: integer("to_chain").notNull(),
		toToken: text("to_token").notNull(),
		toAmount: text("to_amount"),
		toAddress: text("to_address").notNull(),
		bridge: text("bridge"),
		txHash: text("tx_hash"),
		status: text("status", { enum: topupEventStatuses }).notNull().default("quoted"),
		errorCode: text("error_code"),
		errorMessage: text("error_message"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		statusCheck: check(
			"topup_events_status_check",
			sql`${table.status} IN ('quoted', 'submitted', 'pending', 'completed', 'partial', 'refunded', 'failed')`,
		),
		byAgent: index("topup_events_by_agent").on(table.agentTokenAddress),
		byPatron: index("topup_events_by_patron").on(table.patronAddress),
		byTxHash: index("topup_events_by_tx_hash").on(table.txHash),
	}),
);

export type TopupEventRow = typeof topupEvents.$inferSelect;
export type NewTopupEvent = typeof topupEvents.$inferInsert;
