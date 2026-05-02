import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { agentPersonas } from "./agent-personas.js";

/**
 * Opaque API keys issued to agents so they can call gated endpoints
 * (notably `POST /v2/agents/launch`). One active key per agent at a time
 * (enforced via partial unique index in the raw SQL migration).
 *
 * Raw keys are `agk_` + 32 hex chars (37 chars total). We store the
 * sha256(raw) in `key_hash` and never persist the raw key itself. The
 * first 12 chars of the raw key (e.g. `agk_abcd1234`) are kept in
 * `key_prefix` for display in admin UIs / logs.
 */
export const agentApiKeys = pgTable(
	"agent_api_keys",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: varchar("agent_id", { length: 128 })
			.notNull()
			.references(() => agentPersonas.agentId, { onDelete: "cascade" }),
		keyHash: text("key_hash").notNull().unique(),
		keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
		/** Scopes granted by this key. v1 only issues `launch:*`. */
		scopes: text("scopes").array().notNull().default(["launch:*"]),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
	},
	(table) => ({
		agentIdIdx: index("idx_agent_api_keys_agent_id").on(table.agentId),
	}),
);

export type AgentApiKeyRow = typeof agentApiKeys.$inferSelect;
export type NewAgentApiKey = typeof agentApiKeys.$inferInsert;
