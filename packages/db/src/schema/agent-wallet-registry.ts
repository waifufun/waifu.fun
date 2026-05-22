import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const agentWalletChains = ["bsc", "eth", "arb", "base", "op", "polygon", "solana"] as const;
export type AgentWalletChain = (typeof agentWalletChains)[number];

export const agentWalletRoles = ["agent-safe", "agent-hot", "patron", "venue-bridge"] as const;
export type AgentWalletRole = (typeof agentWalletRoles)[number];

export const agentWalletOwnerTypes = ["agent", "patron", "platform"] as const;
export type AgentWalletOwnerType = (typeof agentWalletOwnerTypes)[number];

/**
 * Public registry of wallets associated with an agent token.
 *
 * NOTE: the legacy `agent_wallets` table already stores launch/orchestrator
 * wallet binding state. This registry intentionally uses its own physical
 * table so the launch pipeline keeps working while dashboard primitives can
 * represent many wallets per token.
 */
export const agentWalletRegistry = pgTable(
	"agent_wallet_registry",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentTokenAddress: text("agent_token_address").notNull(),
		address: text("address").notNull(),
		chain: text("chain", { enum: agentWalletChains }).notNull(),
		role: text("role", { enum: agentWalletRoles }).notNull(),
		venue: text("venue"),
		label: text("label").notNull(),
		ownerType: text("owner_type", { enum: agentWalletOwnerTypes }).notNull().default("agent"),
		addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
		addedBy: text("added_by"),
	},
	(table) => ({
		uniqAgentAddrChain: uniqueIndex("agent_wallet_registry_uniq_agent_addr_chain").on(
			table.agentTokenAddress,
			table.address,
			table.chain,
		),
		byAgent: index("agent_wallet_registry_by_agent").on(table.agentTokenAddress),
	}),
);

export type AgentWalletRegistryRow = typeof agentWalletRegistry.$inferSelect;
export type NewAgentWalletRegistryRow = typeof agentWalletRegistry.$inferInsert;
