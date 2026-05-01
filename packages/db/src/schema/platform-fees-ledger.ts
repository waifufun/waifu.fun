import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { agentPersonas } from "./agent-personas.js";

export const platformFeeSources = ["curve-trade", "post-grad-tax", "manual"] as const;
export type PlatformFeeSource = (typeof platformFeeSources)[number];

export const platformFeesLedger = pgTable(
	"platform_fees_ledger",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agentPersonas.id, { onDelete: "cascade" }),
		txHash: text("tx_hash").notNull(),
		amountWei: text("amount_wei").notNull(),
		tokenAddress: text("token_address").notNull(),
		chain: text("chain").notNull(),
		source: text("source").notNull().$type<PlatformFeeSource>(),
		recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		txAgentUnique: uniqueIndex("platform_fees_ledger_tx_hash_agent_id_unique").on(table.txHash, table.agentId),
		sourceCheck: check(
			"platform_fees_ledger_source_check",
			sql`${table.source} in ('curve-trade', 'post-grad-tax', 'manual')`,
		),
	}),
);

export type PlatformFeeLedgerRow = typeof platformFeesLedger.$inferSelect;
export type NewPlatformFeeLedger = typeof platformFeesLedger.$inferInsert;
