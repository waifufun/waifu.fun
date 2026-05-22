import { relations, sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { agentWallets } from "./agent-wallets.js";

export const agentLaunchStatusEnum = pgEnum("agent_launch_status", [
	"prepared",
	"claimed",
	"launched",
	"expired",
	"cancelled",
]);

export type AgentLaunchStatus = (typeof agentLaunchStatusEnum.enumValues)[number];

/**
 * Per-agent persona config. One row per agent (keyed by `agent_id`).
 *
 * `agent_id` is the internal slug used by the orchestrator (e.g.
 * `waifu-solmaren-ab12cd34ef56`). `token_address` is filled in after the
 * Four.Meme TokenCreate event is observed — it's nullable while the launch
 * is in flight.
 *
 * Twitter credentials are stored in plaintext for v1. TODO: encrypt these
 * with AES-256-GCM + `ENCRYPTION_KEY` env var before production launch.
 */
export const agentPersonas = pgTable(
	"agent_personas",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		/** Internal agent slug. Unique across all personas. */
		agentId: varchar("agent_id", { length: 128 }).notNull().unique(),
		/** On-chain ERC20 address. Nullable until the token is deployed. */
		tokenAddress: varchar("token_address", { length: 66 }),
		/** Patron wallet that owns/authorizes the agent's Safe. Nullable for legacy demo rows. */
		ownerAddress: text("owner_address"),
		/** Steward user that owns the agent. Nullable during W9 online backfill. */
		ownerStewardUserId: text("owner_steward_user_id"),

		name: varchar("name", { length: 100 }).notNull(),
		bio: text("bio"),
		avatarUrl: text("avatar_url"),

		/** Preset: trader | memer | analyst | philosopher | support | custom */
		preset: varchar("preset", { length: 50 }),
		systemPrompt: text("system_prompt"),
		traits: jsonb("traits").$type<string[]>().default([]),

		twitterHandle: varchar("twitter_handle", { length: 30 }),
		// TODO(security): encrypt these with AES-256-GCM + ENCRYPTION_KEY env var
		// before production launch. For v1 (hackathon) we store plaintext.
		twitterAccessToken: text("twitter_access_token"),
		twitterAccessSecret: text("twitter_access_secret"),

		/** Freeform additional metadata (character file refs, voice config, etc.). */
		metadata: jsonb("metadata"),

		// v3 claim flow (migration 0007) --------------------------------------
		/**
		 * Lifecycle state. `prepared` after /v2/agents/prepare. `claimed` after
		 * a patron completes X-auth on /claim/:token. `launched` once the tx
		 * broadcasts. `expired` / `cancelled` are terminal.
		 */
		agentLaunchStatus: agentLaunchStatusEnum("agent_launch_status"),
		/** SHA-256 of the raw claim token. Raw token lives only in the claim URL. */
		claimTokenHash: varchar("claim_token_hash", { length: 64 }),
		claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
		claimedByXUserId: varchar("claimed_by_x_user_id", { length: 64 }),
		claimedByXHandle: varchar("claimed_by_x_handle", { length: 64 }),
		claimedAt: timestamp("claimed_at", { withTimezone: true }),
		launchedAt: timestamp("launched_at", { withTimezone: true }),
		launchTxHash: varchar("launch_tx_hash", { length: 66 }),
		/** Input params captured at /prepare time so /launch can replay them. */
		prelaunchParams: jsonb("prelaunch_params"),
		/** Four.meme-issued createArg (hex), cached at /prepare so we don't call their API again. */
		prelaunchCreateArg: text("prelaunch_create_arg"),
		/** Four.meme-issued signature (hex), paired with createArg. */
		prelaunchSignature: text("prelaunch_signature"),
		/** four.meme tokenTaxInfo: fee_rate in {1,3,5,10}. */
		taxFeeRate: integer("tax_fee_rate"),
		/** recipient of the `recipient_rate` share of the tax. */
		taxRecipientAddress: varchar("tax_recipient_address", { length: 42 }),
		/** Full tax breakdown (burnRate/divideRate/liquidityRate/recipientRate/minSharing). */
		taxConfig: jsonb("tax_config"),
		/** Flap Split Vault address for new VaultPortal launches. */
		taxVaultAddress: text("tax_vault_address"),

		// v3 multi-launchpad metadata (Launchpad Wave / W1.B) -----------------
		launchpadId: text("launchpad_id"),
		launchpadConfig: jsonb("launchpad_config"),
		/** App-layer validated: bsc | solana | base | ethereum. */
		chain: text("chain"),

		// Legacy compatibility (W6.5) ----------------------------------------
		/** v1/hackathon-era agents kept queryable but hidden from new public surfaces by default. */
		legacyV1: boolean("legacy_v1").default(false),

		// Moderation controls (W1.8) ------------------------------------------
		/** Brain freeze: stops inference, tweets, and trade decisions. */
		brainPausedAt: timestamp("brain_paused_at", { withTimezone: true }),
		brainPausedReason: text("brain_paused_reason"),
		/** Withdrawal freeze: blocks adapter calls that move funds. */
		withdrawalsPausedAt: timestamp("withdrawals_paused_at", { withTimezone: true }),
		withdrawalsPausedReason: text("withdrawals_paused_reason"),
		/** Permanent kill-switch. A killed agent must never resume. */
		killedAt: timestamp("killed_at", { withTimezone: true }),
		killedReason: text("killed_reason"),

		// Graceful shutdown (W3.7) -------------------------------------------
		/** Dormant agents have exhausted credits and should not run brain/outbound adapter loops. */
		dormantAt: timestamp("dormant_at", { withTimezone: true }),
		/** Inference tier used by the brain runtime. */
		modelTier: text("model_tier").$type<"premium" | "standard" | "free">().default("premium"),
		/** Set after the final X post is sent for a credits-depleted shutdown. */
		lastWordsPostedAt: timestamp("last_words_posted_at", { withTimezone: true }),
		/** Number of patron credit top-ups processed through resurrection. */
		creditsTopUpCount: integer("credits_top_up_count").default(0),

		// Runtime connection (W6.1 + W6.4) -------------------------------
		/** Runtime connection kind. "eliza-cloud" (default), "third-party-webhook", "third-party-pull". */
		runtimeKind: text("runtime_kind").notNull().default("eliza-cloud"),
		/** External webhook URL for push-mode runtimes. */
		runtimeWebhookUrl: text("runtime_webhook_url"),
		/** Bcrypt hash of the webhook secret. */
		runtimeWebhookSecretHash: text("runtime_webhook_secret_hash"),
		/** SHA-256 hash of the BYO pull-mode runtime API key. Raw key returned once at provision. */
		runtimeApiKeyHash: text("runtime_api_key_hash"),
		/** Last successful pull-mode auth/heartbeat timestamp. */
		runtimeLastSeenAt: timestamp("runtime_last_seen_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		tokenAddressIdx: index("idx_agent_personas_token_address").on(table.tokenAddress),
		ownerStewardUserIdIdx: index("agent_personas_owner_steward_user_id_idx").on(table.ownerStewardUserId),
		presetIdx: index("idx_agent_personas_preset").on(table.preset),
		launchStatusIdx: index("idx_agent_personas_agent_launch_status").on(table.agentLaunchStatus),
		claimTokenIdx: uniqueIndex("idx_agent_personas_claim_token")
			.on(table.claimTokenHash)
			.where(sql`${table.claimTokenHash} IS NOT NULL`),
		claimedByXIdx: index("idx_agent_personas_claimed_by_x")
			.on(table.claimedByXHandle)
			.where(sql`${table.claimedByXHandle} IS NOT NULL`),
		runtimeApiKeyHashIdx: uniqueIndex("idx_agent_personas_runtime_api_key_hash")
			.on(table.runtimeApiKeyHash)
			.where(sql`${table.runtimeApiKeyHash} IS NOT NULL`),
	}),
);

export const agentPersonasRelations = relations(agentPersonas, ({ one }) => ({
	wallet: one(agentWallets, {
		fields: [agentPersonas.agentId],
		references: [agentWallets.internalAgentId],
	}),
}));

export type AgentPersonaRow = typeof agentPersonas.$inferSelect;
export type NewAgentPersona = typeof agentPersonas.$inferInsert;
