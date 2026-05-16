/**
 * Dispatcher: takes detected events × subscriptions, formats per channel,
 * sends, and records the result. Channel sends are abstracted behind the
 * `ChannelSender` interface so unit tests can plug in fakes (and the
 * `--dry-run` mode can plug in a stdout-only sender).
 */

import type { Logger } from "@waifufun/logger";

import { buildDiscordPayload, sendDiscordWebhook } from "./channels/discord.js";
import { buildTelegramPayload, sendTelegramMessage } from "./channels/telegram.js";
import type { NotificationsConfig } from "./config.js";
import { type FormatContext, formatMessage } from "./format.js";
import type { NotificationsRepository } from "./repository.js";
import type {
	AlreadySentLookup,
	Channel,
	DeliveryResult,
	EventType,
	NotificationLogInput,
	PendingEvent,
	SubscriptionRecord,
} from "./types.js";
import { noSubscribersDedupeKey } from "./types.js";

export interface ChannelSender {
	send(args: {
		channel: Channel;
		subscription: SubscriptionRecord;
		event: PendingEvent;
		botTokenFallback: string | undefined;
	}): Promise<{ result: DeliveryResult; payload: Record<string, unknown>; webhookUrl: string | null }>;
}

export interface LiveSenderDeps {
	fetchImpl?: typeof fetch;
}

export class LiveChannelSender implements ChannelSender {
	constructor(
		private readonly cfg: NotificationsConfig,
		private readonly deps: LiveSenderDeps = {},
	) {}

	async send(args: {
		channel: Channel;
		subscription: SubscriptionRecord;
		event: PendingEvent;
		botTokenFallback: string | undefined;
	}): Promise<{ result: DeliveryResult; payload: Record<string, unknown>; webhookUrl: string | null }> {
		const { channel, subscription, event } = args;
		const fmtCtx: FormatContext = { frontendUrl: this.cfg.frontendUrl };
		const message = formatMessage(event.eventType, event.detail, event.launch, fmtCtx);

		if (channel === "discord") {
			const payload = buildDiscordPayload(event.eventType, message);
			const send = await sendDiscordWebhook(subscription.target, payload, { fetchImpl: this.deps.fetchImpl });
			return {
				result: {
					status: send.status,
					statusCode: send.statusCode,
					errorMessage: send.error,
				},
				payload: payload as unknown as Record<string, unknown>,
				webhookUrl: subscription.target,
			};
		}

		// telegram
		const token = subscription.botToken ?? args.botTokenFallback;
		if (!token) {
			return {
				result: {
					status: "failed",
					statusCode: "0",
					errorMessage: "telegram bot token missing (no per-subscription token and TELEGRAM_BOT_TOKEN unset)",
				},
				payload: {},
				webhookUrl: null,
			};
		}
		const payload = buildTelegramPayload(subscription.target, message);
		const send = await sendTelegramMessage(token, payload, { fetchImpl: this.deps.fetchImpl });
		return {
			result: {
				status: send.status,
				statusCode: send.statusCode,
				errorMessage: send.error,
			},
			payload: payload as unknown as Record<string, unknown>,
			webhookUrl: null,
		};
	}
}

/**
 * Dry-run sender. Logs the payload, returns `skipped` for every send so the
 * dedupe row is still written (operator can replay later by deleting the
 * `skipped` row).
 */
export class DryRunChannelSender implements ChannelSender {
	constructor(
		private readonly cfg: NotificationsConfig,
		private readonly logger: Logger,
	) {}

	async send(args: {
		channel: Channel;
		subscription: SubscriptionRecord;
		event: PendingEvent;
		botTokenFallback: string | undefined;
	}): Promise<{ result: DeliveryResult; payload: Record<string, unknown>; webhookUrl: string | null }> {
		const fmtCtx: FormatContext = { frontendUrl: this.cfg.frontendUrl };
		const message = formatMessage(args.event.eventType, args.event.detail, args.event.launch, fmtCtx);
		const payload =
			args.channel === "discord"
				? (buildDiscordPayload(args.event.eventType, message) as unknown as Record<string, unknown>)
				: (buildTelegramPayload(args.subscription.target, message) as unknown as Record<string, unknown>);

		this.logger.info(
			{
				dryRun: true,
				launchId: args.event.launch.id,
				eventType: args.event.eventType,
				channel: args.channel,
				target: args.subscription.target,
				payload,
			},
			"dry-run notification",
		);

		return {
			result: {
				status: "skipped",
				statusCode: "0",
				errorMessage: null,
			},
			payload,
			webhookUrl: args.channel === "discord" ? args.subscription.target : null,
		};
	}
}

export interface DispatcherDeps {
	repo: NotificationsRepository;
	sender: ChannelSender;
	cfg: NotificationsConfig;
	logger: Logger;
}

export function dedupeKeyFor(event: PendingEvent): string {
	if (event.detail.kind === "tranche_deployed") {
		return `t${event.detail.trancheIndex}`;
	}
	return "";
}

function isFilteredOut(subscription: SubscriptionRecord, eventType: EventType): boolean {
	if (!subscription.eventFilter || subscription.eventFilter.length === 0) return false;
	return !subscription.eventFilter.includes(eventType);
}

/**
 * Dispatch a single pending event to every matching subscription. Records
 * one row per (launch, event, channel, dedupeKey) regardless of outcome.
 */
export async function dispatchEvent(
	deps: DispatcherDeps,
	event: PendingEvent,
	subscriptions: SubscriptionRecord[],
	alreadySent?: AlreadySentLookup,
): Promise<{ sent: number; failed: number; skipped: number; noSubscribers: boolean }> {
	const dedupeKey = dedupeKeyFor(event);
	const eligible = subscriptions.filter((s) => s.launchId === event.launch.id && !isFilteredOut(s, event.eventType));
	const pending = alreadySent
		? eligible.filter((s) => !alreadySent.has(event.launch.id, event.eventType, s.channel, dedupeKey))
		: eligible;

	if (eligible.length === 0) {
		// Nothing to send – record a single sentinel row so we don't re-detect
		// this event every tick. Keep the sentinel out of normal channel dedupe
		// space so a later subscriber can still receive the event.
		await deps.repo.recordSend({
			launchId: event.launch.id,
			eventType: event.eventType,
			channel: "discord",
			dedupeKey: noSubscribersDedupeKey(dedupeKey),
			webhookUrl: null,
			status: "skipped",
			statusCode: "0",
			errorMessage: "no subscribers",
			payload: { reason: "no_subscribers" },
		});
		return { sent: 0, failed: 0, skipped: 0, noSubscribers: true };
	}

	let sent = 0;
	let failed = 0;
	let skipped = 0;
	for (const sub of pending) {
		const out = await deps.sender.send({
			channel: sub.channel,
			subscription: sub,
			event,
			botTokenFallback: deps.cfg.telegramBotToken,
		});

		const logEntry: NotificationLogInput = {
			launchId: event.launch.id,
			eventType: event.eventType,
			channel: sub.channel,
			dedupeKey,
			webhookUrl: out.webhookUrl,
			status: out.result.status,
			statusCode: out.result.statusCode,
			errorMessage: out.result.errorMessage,
			payload: out.payload,
		};
		await deps.repo.recordSend(logEntry);

		if (out.result.status === "sent") sent++;
		else if (out.result.status === "failed") failed++;
		else skipped++;

		const level = out.result.status === "failed" ? "warn" : "info";
		deps.logger[level](
			{
				launchId: event.launch.id,
				eventType: event.eventType,
				channel: sub.channel,
				status: out.result.status,
				statusCode: out.result.statusCode,
				error: out.result.errorMessage,
			},
			"notification dispatched",
		);
	}

	return { sent, failed, skipped, noSubscribers: false };
}
