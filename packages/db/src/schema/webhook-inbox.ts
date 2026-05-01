import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Idempotency ledger for inbound webhooks.
 *
 * A nullable key lets third-party senders without an idempotency key still be
 * recorded without collapsing all such deliveries into one unique value.
 */
export const webhookInbox = pgTable("webhook_inbox", {
	id: uuid("id").primaryKey().defaultRandom(),
	key: text("key").unique(),
	eventType: text("event_type").notNull(),
	receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WebhookInboxRow = typeof webhookInbox.$inferSelect;
export type NewWebhookInboxRow = typeof webhookInbox.$inferInsert;
