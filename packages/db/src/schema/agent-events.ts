import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const AGENT_EVENT_TYPES = [
	// lifecycle
	"agent.prepared",
	"agent.claimed",
	"agent.launched",
	"agent.graduated",
	"agent.paused",
	"agent.resumed",
	"agent.killed",
	"agent.kill_activated",
	"agent.revived",
	"agent.provisioning_started",
	"agent.provisioned",
	"agent.provisioning_failed",
	"agent.provisioning_dead_letter",
	"agent.credits.low",
	"agent.credits.depleted",
	"agent.downgraded",
	"agent.last_words_posted",
	"agent.dormant",
	"agent.resurrected",
	"agent.heartbeat",
	"agent.safe.deployed",
	"agent.roles.configured",
	"agent.policy.seeded",
	"launch.prepared",
	"launch.authorized",
	"launch.queued",
	"launch.submitted",
	"launch.confirmed",
	"launch.failed",
	"launch.metadata_upload_started",
	"launch.metadata_upload_succeeded",
	"launch.metadata_upload_failed",
	"agent.reconciliation.drift",
	"reindex.requested",
	"system.cache_warmed",
	"system.reindex_triggered",
	"system.notification_dispatched",
	"system.notification_failed",

	// tokens / trades
	"token.created",
	"token.purchased",
	"token.sold",
	"token.migrated",

	// tax / treasury
	"tax.split.configured",
	"tax.received",
	"treasury.swept",
	"treasury.transfer",
	"transfer.in",
	"transfer.out",
	"bridge.initiated",
	"bridge.completed",
	"bridge.failed",
	"hl.deposit",
	"hl.withdrawal",
	"safe.tx.proposed",
	"safe.tx.signed",
	"safe.tx.executed",
	"safe.tx",

	// wallet / policy / sessions
	"wallet.provisioned",
	"policy.applied",
	"policy.denied",
	"policy.needs_manual",
	"session.opened",
	"session.revoked",
	"trade.session.opened",
	"trade.open",
	"trade.close",
	"trade.fill",
	"trade.liquidation",

	// X / social
	"x.connected",
	"x.disconnected",
	"x.token.refresh_exhausted",
	"x.posted",
	"x.replied",
	"x.dm.received",

	// inference / credits
	"inference.spent",
	"credits.topped_up",
	"credits.low",
	"credits.depleted",
	"agent.last_words",
	"identity.registered",
	"identity.card_updated",
	"discord.posted",
	"telegram.posted",

	// adapter actions (generic)
	"action.swap",
	"action.open_position",
	"action.close_position",
	"action.lend",
	"action.borrow",
	"action.bet",
	"action.dispatched",
	"launch.confirmed",

	// worker/system meta-events
	"launch.prepared",
	"launch.authorized",
	"launch.queued",
	"launch.submitted",
	"launch.confirmed",
	"launch.failed",
	"launch.metadata_upload_started",
	"launch.metadata_upload_succeeded",
	"launch.metadata_upload_failed",
	"agent.reconciliation.drift",
	"reindex.requested",
	"system.cache_warmed",
	"system.reindex_triggered",
	"system.notification_dispatched",
	"system.notification_failed",

	// legacy brain bus aliases kept for readers/processors that still speak them
	"agent.created",
	"agent.trade.buy",
	"agent.trade.sell",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

/** Fast runtime validation without duplicating the literal union. */
export const AGENT_EVENT_TYPE_SET: ReadonlySet<string> = new Set(AGENT_EVENT_TYPES);

/**
 * Canonical activity stream for public feeds, patron dashboards, webhooks,
 * analytics, and the existing brain-worker queue.
 *
 * W1.7 adds canonical `event_type` + `data` while preserving the legacy
 * queue columns (`type`, `payload`, `status`, attempts, ...). Indexer/brain
 * code may continue using the queue shape; API-facing consumers should read
 * `eventType`/`data`.
 */
export const agentEvents = pgTable(
	"agent_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		/** Internal agent slug (agent_wallets.internal_agent_id). Nullable during hydration. */
		agentId: varchar("agent_id", { length: 128 }),

		/** Canonical event kind for feeds/webhooks/analytics. */
		eventType: text("event_type").$type<AgentEventType>().notNull(),
		/** Canonical event payload for feeds/webhooks/analytics. */
		data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
		/** Producer name for debugging/idempotency (hl-listener, evm-indexer:bsc, steward-webhook, ...). */
		source: text("source").notNull().default("legacy"),
		/** Per-source deterministic idempotency key. */
		sourceEventId: text("source_event_id").notNull().default(sql`gen_random_uuid()::text`),
		/** Shared id across multi-step flows (bridge, Safe lifecycle, etc.). */
		correlationId: text("correlation_id"),
		/** When the event happened at the source; createdAt remains ingestion time. */
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
		/** public rows render in feed; operator/platform rows stay internal. */
		visibility: text("visibility").$type<"public" | "operator" | "platform">().notNull().default("public"),
		/** Optional on-chain coordinates for chain-derived events. */
		txHash: text("tx_hash"),
		blockNumber: text("block_number"),
		chainId: text("chain_id"),

		/** On-chain ERC20 of the agent token the event is about. */
		tokenAddress: varchar("token_address", { length: 66 }),
		/** Legacy brain bus event kind (kept until the worker is migrated). */
		type: varchar("type", { length: 50 }).notNull(),
		/** Legacy brain bus payload (kept until the worker is migrated). */
		payload: jsonb("payload").notNull(),
		/** pending | processing | done | failed | skipped */
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		attempts: integer("attempts").notNull().default(0),
		errorMessage: text("error_message"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		processedAt: timestamp("processed_at", { withTimezone: true }),
	},
	(table) => ({
		agentIdx: index("idx_agent_events_agent_id").on(table.agentId),
		typeIdx: index("idx_agent_events_type").on(table.eventType),
		createdAtIdx: index("idx_agent_events_created_at").on(table.createdAt.desc()),
		statusCreatedIdx: index("idx_agent_events_status_created_at").on(table.status, table.createdAt),
		sourceEventUniqueIdx: uniqueIndex("agent_events_source_event_id_unique").on(table.source, table.sourceEventId),
		correlationIdx: index("idx_agent_events_correlation_id").on(table.correlationId),
		visibilityOccurredIdx: index("idx_agent_events_visibility_occurred_at").on(
			table.visibility,
			table.occurredAt.desc(),
		),
		tokenCreatedIdx: index("idx_agent_events_token_created_at").on(table.tokenAddress, table.createdAt),
	}),
);

export type AgentEvent = typeof agentEvents.$inferSelect;
export type AgentEventRow = AgentEvent;
export type NewAgentEvent = typeof agentEvents.$inferInsert;

export function isAgentEventType(value: string): value is AgentEventType {
	return AGENT_EVENT_TYPE_SET.has(value);
}

/**
 * Map legacy brain-bus names to W1.7 canonical feed names.
 */
export function canonicalAgentEventType(type: string): AgentEventType {
	switch (type) {
		case "agent.created":
			return "token.created";
		case "agent.trade.buy":
			return "token.purchased";
		case "agent.trade.sell":
			return "token.sold";
		default:
			if (isAgentEventType(type)) return type;
			throw new Error(`unknown agent event type: ${type}`);
	}
}

/**
 * Canonical event type constants. Import these instead of raw strings.
 */
export const AgentEventTypes = {
	Prepared: "agent.prepared",
	Claimed: "agent.claimed",
	Launched: "agent.launched",
	Graduated: "agent.graduated",
	Paused: "agent.paused",
	Resumed: "agent.resumed",
	Killed: "agent.killed",
	KillActivated: "agent.kill_activated",
	Revived: "agent.revived",
	ProvisioningStarted: "agent.provisioning_started",
	Provisioned: "agent.provisioned",
	ProvisioningFailed: "agent.provisioning_failed",
	ProvisioningDeadLetter: "agent.provisioning_dead_letter",
	SafeDeployed: "agent.safe.deployed",
	RolesConfigured: "agent.roles.configured",
	PolicySeeded: "agent.policy.seeded",
	LaunchPrepared: "launch.prepared",
	LaunchMetadataUploadStarted: "launch.metadata_upload_started",
	LaunchMetadataUploadSucceeded: "launch.metadata_upload_succeeded",
	LaunchMetadataUploadFailed: "launch.metadata_upload_failed",
	AgentReconciliationDrift: "agent.reconciliation.drift",
	ReindexRequested: "reindex.requested",
	SystemCacheWarmed: "system.cache_warmed",
	SystemReindexTriggered: "system.reindex_triggered",
	SystemNotificationDispatched: "system.notification_dispatched",
	SystemNotificationFailed: "system.notification_failed",
	TokenCreated: "token.created",
	TokenPurchased: "token.purchased",
	TokenSold: "token.sold",
	TokenMigrated: "token.migrated",
	TaxSplitConfigured: "tax.split.configured",
	TaxReceived: "tax.received",
	TreasurySwept: "treasury.swept",
	TreasuryTransfer: "treasury.transfer",
	TransferIn: "transfer.in",
	TransferOut: "transfer.out",
	BridgeInitiated: "bridge.initiated",
	BridgeCompleted: "bridge.completed",
	BridgeFailed: "bridge.failed",
	HyperliquidDeposit: "hl.deposit",
	HyperliquidWithdrawal: "hl.withdrawal",
	SafeTxProposed: "safe.tx.proposed",
	SafeTxSigned: "safe.tx.signed",
	SafeTxExecuted: "safe.tx.executed",
	SafeTx: "safe.tx",
	WalletProvisioned: "wallet.provisioned",
	PolicyApplied: "policy.applied",
	PolicyDenied: "policy.denied",
	PolicyNeedsManual: "policy.needs_manual",
	SessionOpened: "session.opened",
	SessionRevoked: "session.revoked",
	TradeSessionOpened: "trade.session.opened",
	TradeOpen: "trade.open",
	TradeClose: "trade.close",
	TradeFill: "trade.fill",
	TradeLiquidation: "trade.liquidation",
	XConnected: "x.connected",
	XDisconnected: "x.disconnected",
	XTokenRefreshExhausted: "x.token.refresh_exhausted",
	XPosted: "x.posted",
	XReplied: "x.replied",
	XDmReceived: "x.dm.received",
	InferenceSpent: "inference.spent",
	CreditsToppedUp: "credits.topped_up",
	CreditsLow: "credits.low",
	CreditsDepleted: "credits.depleted",
	AgentCreditsLow: "agent.credits.low",
	AgentCreditsDepleted: "agent.credits.depleted",
	AgentDowngraded: "agent.downgraded",
	AgentLastWordsPosted: "agent.last_words_posted",
	AgentDormant: "agent.dormant",
	AgentResurrected: "agent.resurrected",
	AgentHeartbeat: "agent.heartbeat",
	AgentLastWords: "agent.last_words",
	IdentityRegistered: "identity.registered",
	IdentityCardUpdated: "identity.card_updated",
	DiscordPosted: "discord.posted",
	TelegramPosted: "telegram.posted",
	ActionSwap: "action.swap",
	ActionOpenPosition: "action.open_position",
	ActionClosePosition: "action.close_position",
	ActionLend: "action.lend",
	ActionBorrow: "action.borrow",
	ActionBet: "action.bet",
	ActionDispatched: "action.dispatched",
	LaunchConfirmed: "launch.confirmed",
	// Back-compat names used by the brain worker handler registry.
	Created: "agent.created",
	TradeBuy: "agent.trade.buy",
	TradeSell: "agent.trade.sell",
	LegacyAgentCreated: "agent.created",
	LegacyTradeBuy: "agent.trade.buy",
	LegacyTradeSell: "agent.trade.sell",
} as const satisfies Record<string, AgentEventType>;

/** Payload shapes (for docs / callers to keep straight). */
export interface AgentCreatedPayload {
	tokenAddress: string;
	creator: string;
	name: string;
	symbol: string;
	blockNumber: string;
	txHash: string;
}

export interface AgentTradeBuyPayload {
	tokenAddress: string;
	buyer: string;
	bnbIn: string;
	tokensOut: string;
	price: string | null;
	blockNumber: string;
	txHash: string;
}

export interface AgentTradeSellPayload {
	tokenAddress: string;
	seller: string;
	tokensIn: string;
	bnbOut: string;
	price: string | null;
	blockNumber: string;
	txHash: string;
}

export interface AgentGraduatedPayload {
	tokenAddress: string;
	pancakePair: string | null;
	blockNumber: string;
	txHash: string;
}
