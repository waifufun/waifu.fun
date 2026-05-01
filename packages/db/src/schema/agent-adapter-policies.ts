import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { agentPersonas } from "./agent-personas.js";

export const agentAdapterPolicies = pgTable(
	"agent_adapter_policies",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agentPersonas.id),
		adapterSlug: text("adapter_slug").notNull(),
		enabled: boolean("enabled").notNull().default(true),
		/** null = unlimited (still capped by Safe signer balance). */
		dailyValueCapWei: text("daily_value_cap_wei"),
		/** null = unlimited. */
		perTxValueCapWei: text("per_tx_value_cap_wei"),
		allowedActions: text("allowed_actions").array().notNull().default([]),
		deniedActions: text("denied_actions").array().notNull().default([]),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		agentAdapterUnique: uniqueIndex("agent_adapter_policies_agent_adapter_unique").on(table.agentId, table.adapterSlug),
	}),
);

export const agentAdapterPoliciesRelations = relations(agentAdapterPolicies, ({ one }) => ({
	agent: one(agentPersonas, {
		fields: [agentAdapterPolicies.agentId],
		references: [agentPersonas.id],
	}),
}));

export type AgentAdapterPolicyRow = typeof agentAdapterPolicies.$inferSelect;
export type NewAgentAdapterPolicy = typeof agentAdapterPolicies.$inferInsert;
