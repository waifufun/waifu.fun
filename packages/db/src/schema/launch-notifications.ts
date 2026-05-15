import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { type JsonMap, emptyJsonObject } from "./_common.js";
import { agentLaunches } from "./agent-launches.js";

/**
 * W46: Launch notifications ledger.
 *
 * Records every notification sent (or attempted) for a launch lifecycle
 * event. Used for:
 *   - Idempotency: (launch_id, event_type, channel) is unique per delivered
 *     send so the poller does not re-emit the same event.
 *   - Audit: who got pinged, where, when, with what payload.
 *
 * Channels:
 *   - "discord": HTTP webhook (creator-supplied URL stored in
 *     `launch_notification_subscriptions`).
 *   - "telegram": chat_id via the platform Telegram bot.
 *
 * Event types:
 *   - "round_opened": LaunchCreated indexed (vault state = open).
 *   - "cap_hit": totalDeposited >= presaleCap (vault still open).
 *   - "launched": vault state transitioned to "launched" (V2 LP deployed).
 *   - "tranche_deployed": tier-snapshot event (T1/T2/T3/T4 thresholds hit
 *     post-launch). Reserved for future on-chain event source.
 *   - "summary_24h": 24h post-launch recap.
 *
 * Status:
 *   - "sent": webhook returned 2xx.
 *   - "failed": webhook returned non-2xx or threw; row preserved so the
 *     idempotency check still skips re-tries (operator can manually replay).
 *   - "skipped": dry-run or no subscriber configured; counts as handled.
 */
export const launchNotificationEventTypes = [
	"round_opened",
	"cap_hit",
	"launched",
	"tranche_deployed",
	"summary_24h",
] as const;
export type LaunchNotificationEventType = (typeof launchNotificationEventTypes)[number];

export const launchNotificationChannels = ["discord", "telegram"] as const;
export type LaunchNotificationChannel = (typeof launchNotificationChannels)[number];

export const launchNotificationStatuses = ["sent", "failed", "skipped"] as const;
export type LaunchNotificationStatus = (typeof launchNotificationStatuses)[number];

export const launchNotifications = pgTable(
	"launch_notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		launchId: uuid("launch_id")
			.notNull()
			.references(() => agentLaunches.id, { onDelete: "cascade" }),
		eventType: text("event_type").$type<LaunchNotificationEventType>().notNull(),
		channel: text("channel").$type<LaunchNotificationChannel>().notNull(),
		webhookUrl: text("webhook_url"),
		/**
		 * Sub-event identifier used together with `event_type` for dedupe. Empty
		 * string for one-shot events; non-empty for events that fire multiple
		 * times per launch (e.g. tranche thresholds: "t1", "t2", ...).
		 */
		dedupeKey: text("dedupe_key").notNull().default(""),
		status: text("status").$type<LaunchNotificationStatus>().notNull().default("sent"),
		statusCode: text("status_code"),
		payload: jsonb("payload").$type<JsonMap>().notNull().default(emptyJsonObject),
		errorMessage: text("error_message"),
		sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		// Idempotency: one row per (launch, event, channel). Prevents duplicate
		// sends when the poller revisits the same state.
		uniq: uniqueIndex("launch_notifications_dedupe").on(
			table.launchId,
			table.eventType,
			table.channel,
			table.dedupeKey,
		),
		launchIdx: index("idx_launch_notifications_launch").on(table.launchId, sql`${table.sentAt} desc`),
		eventIdx: index("idx_launch_notifications_event").on(table.eventType),
	}),
);

export type LaunchNotificationRow = typeof launchNotifications.$inferSelect;
export type NewLaunchNotification = typeof launchNotifications.$inferInsert;

/**
 * Per-launch subscription targets. Creators register a Discord webhook URL
 * and/or Telegram chat ID before/after launch via the API; the notifier reads
 * this table to know where to fire each event.
 *
 * One row per (launch_id, channel). Re-registering the same channel updates
 * the target.
 */
export const launchNotificationSubscriptions = pgTable(
	"launch_notification_subscriptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		launchId: uuid("launch_id")
			.notNull()
			.references(() => agentLaunches.id, { onDelete: "cascade" }),
		channel: text("channel").$type<LaunchNotificationChannel>().notNull(),
		// Discord: full webhook URL. Telegram: chat_id (numeric or @channel).
		target: text("target").notNull(),
		// Optional: override the platform bot token (Telegram only). Most
		// subscriptions leave this null and use the env-configured bot.
		botToken: varchar("bot_token", { length: 256 }),
		// JSON map of opt-in event types. If empty / null, all events are sent.
		eventFilter: jsonb("event_filter").$type<JsonMap>().notNull().default(emptyJsonObject),
		createdBy: varchar("created_by", { length: 42 }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => ({
		uniq: uniqueIndex("launch_notification_subs_dedupe").on(table.launchId, table.channel),
		launchIdx: index("idx_launch_notification_subs_launch").on(table.launchId),
	}),
);

export type LaunchNotificationSubscriptionRow = typeof launchNotificationSubscriptions.$inferSelect;
export type NewLaunchNotificationSubscription = typeof launchNotificationSubscriptions.$inferInsert;
