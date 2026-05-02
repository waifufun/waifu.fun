import { index, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/**
 * One row per launched agent. `agent_token` is the on-chain ERC20 address that
 * Four.Meme deploys via `TokenManager2.createToken`. `wallet_address` is the
 * Steward-managed agent wallet that authored the launch. `safe_address` is the
 * (optional) treasury — for TaxToken creators it's the `recipientAddress` on
 * the token's tax config.
 *
 * Columns are additive so existing rows (pre-Four.Meme pivot) stay valid.
 */
export const agentWallets = pgTable(
	"agent_wallets",
	{
		id: serial("id").primaryKey(),
		/**
		 * On-chain ERC20 address of the launched token. Nullable: we provision
		 * an agent wallet row (wallet_address + persona) *before* the token is
		 * deployed on four.meme. The indexer's TokenCreate handler fills this in
		 * once it observes the launch. Unique once set.
		 */
		agentToken: varchar("agent_token", { length: 42 }),
		/** Steward-managed EOA that signed the launch tx. */
		walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
		/** Treasury / Safe address (TaxToken `recipientAddress`). */
		safeAddress: varchar("safe_address", { length: 42 }),
		/** Steward tenant id, e.g. "waifu". */
		stewardTenantId: varchar("steward_tenant_id", { length: 255 }),
		/** Steward internal agent id — stable across wallet rotations. */
		stewardAgentId: text("steward_agent_id"),
		/** Four.Meme requestId from the TokenCreate event (for API lookups). */
		fourMemeRequestId: text("four_meme_request_id"),
		/** BSC tx hash of the createToken call. */
		launchTxHash: varchar("launch_tx_hash", { length: 66 }),
		/** Internal agent slug/id used in our API. */
		internalAgentId: text("internal_agent_id"),
		/** Arbitrary persona config — LLM prompt, voice, art links, etc. */
		persona: jsonb("persona"),
		/** Free-form metadata (image URL, labels, creator notes). */
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		agentTokenUnique: uniqueIndex("agent_wallet_token_unique").on(table.agentToken),
		walletAddressIdx: index("idx_agent_wallet_address").on(table.walletAddress),
		internalAgentIdx: index("idx_agent_wallet_internal_id").on(table.internalAgentId),
		stewardAgentIdx: index("idx_agent_wallet_steward_id").on(table.stewardAgentId),
	}),
);

export type AgentWalletRow = typeof agentWallets.$inferSelect;
export type NewAgentWalletRow = typeof agentWallets.$inferInsert;
