import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tokens } from "./tokens.js";

export const agents = pgTable(
	"agents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tokenId: uuid("token_id")
			.notNull()
			.references(() => tokens.id),
		name: text("name").notNull(),
		bio: text("bio"),
		avatarUrl: text("avatar_url"),
		cloudAgentId: text("cloud_agent_id"),
		runtimeProvider: text("runtime_provider"),
		agentStatus: text("agent_status").notNull().default("none"),
		lifecycleState: text("lifecycle_state"),
		webUiUrl: text("web_ui_url"),
		bridgeUrl: text("bridge_url"),
		billingMode: text("billing_mode"),
		infraReserveUsd: numeric("infra_reserve_usd"),
		suspendedReason: text("suspended_reason"),
		lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		tokenIdx: index("idx_agents_token").on(table.tokenId),
		statusIdx: index("idx_agents_status").on(table.agentStatus),
	}),
);
