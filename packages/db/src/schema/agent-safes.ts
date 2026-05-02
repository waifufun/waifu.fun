import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { agentPersonas } from "./agent-personas.js";

export const agentSafes = pgTable(
	"agent_safes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agentPersonas.id, { onDelete: "cascade" }),
		chain: text("chain").notNull().default("bsc"),
		safeAddress: text("safe_address").notNull(),
		zodiacModifierAddress: text("zodiac_modifier_address"),
		agentRoleId: text("agent_role_id"),
		patronRoleId: text("patron_role_id"),
		deployedAt: timestamp("deployed_at", { withTimezone: true }).defaultNow(),

		// Legacy W1.C fields retained so existing Safe deployment code keeps compiling
		// until it is migrated fully onto the v3 string-chain columns.
		rolesModifierAddress: text("roles_modifier_address"),
		chainId: integer("chain_id").notNull().default(56),
		deployTxHash: text("deploy_tx_hash"),
	},
	(table) => ({
		agentChainUnique: uniqueIndex("agent_safes_agent_id_chain_unique").on(table.agentId, table.chain),
	}),
);

export const agentSafesRelations = relations(agentSafes, ({ one }) => ({
	agent: one(agentPersonas, {
		fields: [agentSafes.agentId],
		references: [agentPersonas.id],
	}),
}));

export type AgentSafeRow = typeof agentSafes.$inferSelect;
export type NewAgentSafe = typeof agentSafes.$inferInsert;
