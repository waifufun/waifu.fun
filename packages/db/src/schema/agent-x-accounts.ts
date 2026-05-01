import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { agentPersonas } from "./agent-personas.js";

export const agentXAccounts = pgTable(
	"agent_x_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: text("agent_id")
			.notNull()
			.unique()
			.references(() => agentPersonas.agentId, { onDelete: "cascade" }),
		xUserId: text("x_user_id").notNull(),
		xHandle: text("x_handle").notNull(),
		xDisplayName: text("x_display_name"),
		xAvatarUrl: text("x_avatar_url"),

		// AES-GCM envelope. keyRef selects which KEK; ciphertext holds {iv, data, tag}
		encryptedAccessToken: jsonb("encrypted_access_token")
			.$type<{ keyRef: string; iv: string; data: string; tag: string }>()
			.notNull(),
		encryptedRefreshToken: jsonb("encrypted_refresh_token").$type<{
			keyRef: string;
			iv: string;
			data: string;
			tag: string;
		} | null>(),

		scope: text("scope").notNull(), // e.g. "tweet.read tweet.write users.read offline.access"
		tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
		lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
		refreshFailureCount: text("refresh_failure_count").default("0"),

		authorizedByPatronUserId: uuid("authorized_by_patron_user_id"),

		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		xUserIdIdx: index("idx_agent_x_accounts_x_user_id").on(table.xUserId),
	}),
);
