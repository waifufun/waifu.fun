/**
 * Notification dispatcher.
 *
 * For a given (launch, eventType) pair:
 *   1. Resolve the active subscription targets (explicit + default).
 *   2. For each (channel, target), check the `launch_notifications`
 *      idempotency table; skip if a row already exists.
 *   3. Format the message, hand to the channel sender.
 *   4. Insert a `launch_notifications` row with the delivery outcome.
 *
 * The idempotency unique index is on (launch_id, event_type, channel) so we
 * never re-fire the same event to the same channel even if multiple targets
 * exist. The dispatcher fans out across SUBSCRIPTIONS but the dedupe row is
 * per CHANNEL; in practice we expect at most one explicit target per channel
 * per launch.
 */

import type { LaunchNotificationChannel, LaunchNotificationEventType } from "@waifufun/db";

import { type FormatContext, type FormattedMessage, formatMessage } from "../formatters/format.js";

import { loadSubscriptions } from "./subscriptions.js";
import type { DeliveryResult, NotifierRuntime, PendingEvent, ResolvedSubscription } from "./types.js";

export interface DispatchResult {
	launchId: string;
	eventType: LaunchNotificationEventType;
	attempted: number;
	dispatched: number;
	skipped: number;
	failed: number;
}

interface RecordInput {
	subscription: ResolvedSubscription;
	eventType: LaunchNotificationEventType;
	message: FormattedMessage;
	delivery: DeliveryResult;
}

async function recordDelivery(runtime: NotifierRuntime, input: RecordInput): Promise<void> {
	const status: "sent" | "failed" | "skipped" = input.delivery.dispatched
		? "sent"
		: input.delivery.error
			? "failed"
			: "skipped";

	await runtime.repo.recordNotification({
		launchId: input.subscription.launchId,
		eventType: input.eventType,
		channel: input.subscription.channel,
		webhookUrl: input.subscription.channel === "discord" ? input.subscription.target : null,
		status,
		statusCode: input.delivery.statusCode != null ? String(input.delivery.statusCode) : null,
		payload: {
			text: input.message.text,
			source: input.subscription.source,
		},
		errorMessage: input.delivery.error,
	});
}

export async function dispatchEvent(runtime: NotifierRuntime, event: PendingEvent): Promise<DispatchResult> {
	const ctx: FormatContext = {
		launch: event.launch,
		publicLaunchUrlPrefix: runtime.config.publicLaunchUrlPrefix,
		occurredAt: event.occurredAt,
		extra: event.context,
	};
	const message = formatMessage(event.eventType, ctx);
	const subscriptions = await loadSubscriptions(runtime.repo, event.launch.id, event.eventType, runtime.config);

	const result: DispatchResult = {
		launchId: event.launch.id,
		eventType: event.eventType,
		attempted: 0,
		dispatched: 0,
		skipped: 0,
		failed: 0,
	};

	if (subscriptions.length === 0) {
		runtime.logger.debug({ launchId: event.launch.id, eventType: event.eventType }, "no subscriptions; skipping");
		return result;
	}

	// Deduplicate by channel: at most one delivery per channel per event.
	const seenChannels = new Set<LaunchNotificationChannel>();
	for (const sub of subscriptions) {
		if (seenChannels.has(sub.channel)) continue;
		seenChannels.add(sub.channel);

		if (await runtime.repo.hasNotification(event.launch.id, event.eventType, sub.channel)) {
			runtime.logger.debug(
				{ launchId: event.launch.id, eventType: event.eventType, channel: sub.channel },
				"notification already recorded; skipping",
			);
			result.skipped += 1;
			continue;
		}

		result.attempted += 1;

		const sender = runtime.senders[sub.channel];
		const delivery = await sender.send({ subscription: sub, message });
		await recordDelivery(runtime, {
			subscription: sub,
			eventType: event.eventType,
			message,
			delivery,
		});

		if (delivery.dispatched) {
			result.dispatched += 1;
		} else if (delivery.error) {
			result.failed += 1;
			runtime.logger.warn(
				{
					launchId: event.launch.id,
					eventType: event.eventType,
					channel: sub.channel,
					statusCode: delivery.statusCode,
					error: delivery.error,
				},
				"notification delivery failed",
			);
		} else {
			// dispatched=false, no error → dry-run / skipped path.
			result.skipped += 1;
		}
	}

	return result;
}
