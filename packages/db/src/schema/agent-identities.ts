import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Latest on-chain/off-chain identity URI for a waifu agent.
 *
 * The immutable historical IPFS payloads stay pinned; this row is only the
 * current pointer we serve from HTTPS and use for on-chain register/update
 * bookkeeping.
 */
export const agentIdentities = pgTable(
	"agent_identities",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentAddress: text("agent_address").notNull(),
		standard: text("standard").notNull(),
		chainId: integer("chain_id").notNull(),
		registry: text("registry").notNull(),
		agentIdOnchain: text("agent_id_onchain"),
		uri: text("uri").notNull(),
		uriIpfs: text("uri_ipfs"),
		uriHttps: text("uri_https"),
		registrationTx: text("registration_tx"),
		registeredAt: timestamp("registered_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		agentStandardChainIdx: uniqueIndex("agent_identities_agent_standard_chain_uidx").on(
			table.agentAddress,
			table.standard,
			table.chainId,
		),
	}),
);

export type AgentIdentityRow = typeof agentIdentities.$inferSelect;
export type NewAgentIdentity = typeof agentIdentities.$inferInsert;
