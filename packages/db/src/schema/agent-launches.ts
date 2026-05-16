import { sql } from "drizzle-orm";
import {
	bigint,
	index,
	integer,
	jsonb,
	pgTable,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { type JsonMap, emptyJsonObject } from "./_common.js";

/**
 * V3 LaunchFactory-deployed launches.
 *
 * Each row corresponds to a single on-chain LaunchCreated event from the
 * LaunchFactory contract (see W40). The token, vault, and router addresses
 * are immutable post-deployment; everything else (state, totals, timestamps)
 * is updated by the W44 indexer as downstream events arrive.
 *
 * Lifecycle: open → closed → launched (or → failed)
 *
 * `state` mirrors the on-chain `LaunchVault.state` enum:
 *   open: presale accepting deposits
 *   closed: presale closed, awaiting BundleRouter execution
 *   launched: BundleExecuted fired, V2 pair live
 *   failed: terminal failure (vault closed without graduation)
 */
export const agentLaunchStates = ["open", "closed", "launched", "failed", "mining_failed"] as const;
export type AgentLaunchState = (typeof agentLaunchStates)[number];

export const launchBundleStatuses = [
	"pending",
	"submitting",
	"submitted",
	"confirmed",
	"failed_retry",
	"failed_terminal",
	"refunded",
] as const;
export type LaunchBundleStatus = (typeof launchBundleStatuses)[number];

export const agentLaunchTiers = [80, 90, 95, 98] as const;
export type AgentLaunchTier = (typeof agentLaunchTiers)[number];

export const agentLaunches = pgTable(
	"agent_launches",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// On-chain immutable identifiers (set on creation).
		tokenAddress: varchar("token_address", { length: 42 }).notNull(),
		vaultAddress: varchar("vault_address", { length: 42 }).notNull(),
		routerAddress: varchar("router_address", { length: 42 }).notNull(),
		taxSplitterAddress: varchar("tax_splitter_address", { length: 42 }),
		treasuryLpAddress: varchar("treasury_lp_address", { length: 42 }),
		creator: varchar("creator", { length: 42 }).notNull(),
		tier: smallint("tier").notNull(),

		// Tier config snapshot (for historical correctness if tier table changes).
		presaleCap: text("presale_cap").notNull(),
		v2BuyBnb: text("v2_buy_bnb").notNull().default("0"),
		vestingEnabled: integer("vesting_enabled").notNull().default(0),

		// Lifecycle state.
		state: text("state").$type<AgentLaunchState>().notNull().default("open"),
		totalDeposited: text("total_deposited").notNull().default("0"),
		bonusPool: text("bonus_pool").notNull().default("0"),
		depositorCount: integer("depositor_count").notNull().default(0),

		closeTimestamp: bigint("close_timestamp", { mode: "bigint" }).notNull(),
		launchTimestamp: bigint("launch_timestamp", { mode: "bigint" }),

		// Post-launch values from BundleExecuted.
		v2Pair: varchar("v2_pair", { length: 42 }),
		openMcBnb: text("open_mc_bnb"),
		curveFillBnb: text("curve_fill_bnb"),
		tokensFromV2: text("tokens_from_v2"),
		tokensBurned: text("tokens_burned"),

		// Token metadata (stored as JSON; mirrors metadataURI contents).
		metadata: jsonb("metadata").$type<JsonMap>().notNull().default(emptyJsonObject),
		metadataUri: text("metadata_uri"),

		// Wave H Flap-native launch flow. Flap mints the final token inside
		// BundleRouter.executeBundle(); we store the raw vanity salt here. The
		// contracts derive the creator-scoped CREATE2 salt from creator + raw salt.
		predictedTokenAddress: varchar("predicted_token_address", { length: 42 }),
		vanitySalt: varchar("vanity_salt", { length: 66 }),
		flapMetaCid: text("flap_meta_cid"),
		flapTokenAddress: varchar("flap_token_address", { length: 42 }),
		bundleTxHash: varchar("bundle_tx_hash", { length: 66 }),
		bundleStatus: text("bundle_status").$type<LaunchBundleStatus>().notNull().default("pending"),
		bundleAttempt: integer("bundle_attempt").notNull().default(0),
		bundleTipBnb: text("bundle_tip_bnb").notNull().default("0.03"),
		bundleFailureReason: text("bundle_failure_reason"),

		// Bookkeeping.
		createTxHash: varchar("create_tx_hash", { length: 66 }),
		createBlockNumber: bigint("create_block_number", { mode: "bigint" }),
		failureReason: text("failure_reason"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		tokenUq: uniqueIndex("agent_launches_token_address_unique").on(table.tokenAddress),
		vaultUq: uniqueIndex("agent_launches_vault_address_unique").on(table.vaultAddress),
		creatorIdx: index("idx_agent_launches_creator").on(table.creator, sql`${table.createdAt} desc`),
		stateIdx: index("idx_agent_launches_state").on(table.state),
		tierIdx: index("idx_agent_launches_tier").on(table.tier),
		predictedTokenIdx: index("idx_agent_launches_predicted_token").on(table.predictedTokenAddress),
		flapTokenIdx: index("idx_agent_launches_flap_token").on(table.flapTokenAddress),
		bundleStatusIdx: index("idx_agent_launches_bundle_status").on(table.bundleStatus),
	}),
);

export type AgentLaunchRow = typeof agentLaunches.$inferSelect;
export type NewAgentLaunch = typeof agentLaunches.$inferInsert;

/**
 * Per-user deposits into a LaunchVault.
 *
 * Indexer appends one row per Deposited event. Aggregation back to a
 * per-user balance is done in queries (sum(amount) - sum(withdrawals)).
 */
export const launchDeposits = pgTable(
	"launch_deposits",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		launchId: uuid("launch_id")
			.notNull()
			.references(() => agentLaunches.id, { onDelete: "cascade" }),
		userAddress: varchar("user_address", { length: 42 }).notNull(),
		amount: text("amount").notNull(),
		txHash: varchar("tx_hash", { length: 66 }).notNull(),
		blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
		logIndex: integer("log_index").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		launchUserIdx: index("idx_launch_deposits_launch_user").on(table.launchId, table.userAddress),
		txLogUq: uniqueIndex("launch_deposits_tx_log_unique").on(table.txHash, table.logIndex),
	}),
);

export type LaunchDepositRow = typeof launchDeposits.$inferSelect;
export type NewLaunchDeposit = typeof launchDeposits.$inferInsert;

/**
 * Per-user withdrawals from a LaunchVault (with penalty).
 */
export const launchWithdrawals = pgTable(
	"launch_withdrawals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		launchId: uuid("launch_id")
			.notNull()
			.references(() => agentLaunches.id, { onDelete: "cascade" }),
		userAddress: varchar("user_address", { length: 42 }).notNull(),
		amount: text("amount").notNull(),
		penalty: text("penalty").notNull().default("0"),
		txHash: varchar("tx_hash", { length: 66 }).notNull(),
		blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
		logIndex: integer("log_index").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		launchUserIdx: index("idx_launch_withdrawals_launch_user").on(table.launchId, table.userAddress),
		txLogUq: uniqueIndex("launch_withdrawals_tx_log_unique").on(table.txHash, table.logIndex),
	}),
);

export type LaunchWithdrawalRow = typeof launchWithdrawals.$inferSelect;
export type NewLaunchWithdrawal = typeof launchWithdrawals.$inferInsert;

/**
 * Post-launch claims (tokens distributed to depositors).
 */
export const launchClaims = pgTable(
	"launch_claims",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		launchId: uuid("launch_id")
			.notNull()
			.references(() => agentLaunches.id, { onDelete: "cascade" }),
		userAddress: varchar("user_address", { length: 42 }).notNull(),
		amount: text("amount").notNull(),
		txHash: varchar("tx_hash", { length: 66 }).notNull(),
		blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
		logIndex: integer("log_index").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		launchUserIdx: index("idx_launch_claims_launch_user").on(table.launchId, table.userAddress),
		txLogUq: uniqueIndex("launch_claims_tx_log_unique").on(table.txHash, table.logIndex),
	}),
);

export type LaunchClaimRow = typeof launchClaims.$inferSelect;
export type NewLaunchClaim = typeof launchClaims.$inferInsert;
