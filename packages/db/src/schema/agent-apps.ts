import { bigserial, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const agentAppStatuses = ["live", "paused", "scheduled"] as const;
export type AgentAppStatus = (typeof agentAppStatuses)[number];

export const agentApps = pgTable(
	"agent_apps",
	{
		id: bigserial("id", { mode: "bigint" }).primaryKey(),
		agentTokenAddress: text("agent_token_address").notNull(),
		appId: text("app_id").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		icon: text("icon"),
		appUrl: text("app_url"),
		status: text("status", { enum: agentAppStatuses }).notNull().default("scheduled"),
		shippedAt: timestamp("shipped_at", { withTimezone: true }),
		revenueLifetimeUsd: numeric("revenue_lifetime_usd").default("0"),
		revenue24hUsd: numeric("revenue_24h_usd").default("0"),
		revenue7dUsd: numeric("revenue_7d_usd").default("0"),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		uniqAgentApp: uniqueIndex("uniq_agent_apps_agent_app").on(table.agentTokenAddress, table.appId),
		idxByRevenue7d: index("idx_agent_apps_revenue7d").on(table.agentTokenAddress, table.revenue7dUsd.desc()),
	}),
);

export type AgentAppRow = typeof agentApps.$inferSelect;
export type NewAgentAppRow = typeof agentApps.$inferInsert;
