/**
 * Notifier runtime factory.
 *
 * Reads env, builds the senders + DB handle, and returns a runtime ready to
 * be passed to the poller / webhook handler.
 */

import { type Database, getDatabase } from "@waifufun/db";
import type { LaunchNotificationChannel } from "@waifufun/db";

import { DiscordSender } from "../channels/discord.js";
import { TelegramSender } from "../channels/telegram.js";
import type { Sender } from "../channels/types.js";

import { logger } from "./logger.js";
import { DrizzleNotifierRepo } from "./repo.js";
import type { NotifierConfig, NotifierRuntime } from "./types.js";

const DEFAULT_PUBLIC_LAUNCH_URL_PREFIX = "https://waifu.fun";
const DEFAULT_SUMMARY_DELAY_MS = 24 * 60 * 60 * 1000;

export function createNotifierConfig(): NotifierConfig {
	const dryRun = process.env.NOTIFICATIONS_DRY_RUN === "1";
	const pollIntervalMs = Number(process.env.NOTIFICATIONS_POLL_INTERVAL_MS ?? 30_000);
	const summaryDelayMs = Number(process.env.NOTIFICATIONS_SUMMARY_DELAY_MS ?? DEFAULT_SUMMARY_DELAY_MS);
	return {
		pollIntervalMs,
		dryRun,
		summaryDelayMs,
		defaultDiscordWebhookUrl: process.env.DISCORD_LAUNCHES_WEBHOOK_URL ?? null,
		defaultTelegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? null,
		defaultTelegramChatId: process.env.TELEGRAM_LAUNCHES_CHAT_ID ?? null,
		publicLaunchUrlPrefix: process.env.PUBLIC_LAUNCH_URL_PREFIX ?? DEFAULT_PUBLIC_LAUNCH_URL_PREFIX,
	};
}

export interface NotifierRuntimeWithDb extends NotifierRuntime {
	db: Database;
}

export function createNotifierRuntime(config: NotifierConfig = createNotifierConfig()): NotifierRuntimeWithDb {
	const { db } = getDatabase();
	const senders: Record<LaunchNotificationChannel, Sender> = {
		discord: new DiscordSender({ logger, dryRun: config.dryRun }),
		telegram: new TelegramSender({
			logger,
			dryRun: config.dryRun,
			defaultBotToken: config.defaultTelegramBotToken,
		}),
	};
	return {
		db,
		repo: new DrizzleNotifierRepo(db),
		logger,
		config,
		now: () => new Date(),
		senders,
	};
}
