/**
 * One pass over all known launches: list, detect events, dispatch, record.
 *
 * Per tick we:
 *   1. Pull launch snapshots (bounded by `maxLaunchesPerTick`).
 *   2. Pull subscriptions and the dedupe lookup for that batch.
 *   3. For each launch run `detectEvents` and dispatch any pending events.
 *
 * Detection is purely state-derived (cap %, vault state, launch_timestamp
 * age). We don't watch the indexer cursor directly; instead we rely on the
 * idempotency index in `launch_notifications`. The dispatcher writes one row
 * per (launch, event, channel, dedupeKey) so re-running the poll loop after
 * a crash won't double-send.
 */

import type { Logger } from "@waifufun/logger";

import type { NotificationsConfig } from "./lib/config.js";
import { detectEvents } from "./lib/detect.js";
import type { ChannelSender } from "./lib/dispatcher.js";
import { dispatchEvent } from "./lib/dispatcher.js";
import type { NotificationsRepository } from "./lib/repository.js";
import type { PendingEvent, SubscriptionRecord } from "./lib/types.js";

export interface PollerDeps {
	repo: NotificationsRepository;
	sender: ChannelSender;
	cfg: NotificationsConfig;
	logger: Logger;
	now?: () => Date;
}

export interface PollResult {
	launchesScanned: number;
	pendingEvents: number;
	sent: number;
	failed: number;
	skipped: number;
	noSubscribers: number;
}

export async function pollOnce(deps: PollerDeps): Promise<PollResult> {
	const now = (deps.now ?? (() => new Date()))();
	const launches = await deps.repo.listLaunches(deps.cfg.maxLaunchesPerTick);
	if (launches.length === 0) {
		return { launchesScanned: 0, pendingEvents: 0, sent: 0, failed: 0, skipped: 0, noSubscribers: 0 };
	}

	const launchIds = launches.map((l) => l.id);
	const [subs, alreadySent] = await Promise.all([
		deps.repo.listSubscriptions(launchIds),
		deps.repo.loadAlreadySent(launchIds),
	]);

	const subsByLaunch = new Map<string, SubscriptionRecord[]>();
	for (const sub of subs) {
		const list = subsByLaunch.get(sub.launchId) ?? [];
		list.push(sub);
		subsByLaunch.set(sub.launchId, list);
	}

	let pendingEvents = 0;
	let sent = 0;
	let failed = 0;
	let skipped = 0;
	let noSubscribers = 0;

	for (const launch of launches) {
		const events: PendingEvent[] = detectEvents(launch, alreadySent, {
			trancheBpsThresholds: deps.cfg.trancheBpsThresholds,
			now,
		});
		pendingEvents += events.length;

		const launchSubs = subsByLaunch.get(launch.id) ?? [];
		for (const event of events) {
			const result = await dispatchEvent(
				{ repo: deps.repo, sender: deps.sender, cfg: deps.cfg, logger: deps.logger },
				event,
				launchSubs,
			);
			sent += result.sent;
			failed += result.failed;
			skipped += result.skipped;
			if (result.noSubscribers) noSubscribers++;
		}
	}

	return {
		launchesScanned: launches.length,
		pendingEvents,
		sent,
		failed,
		skipped,
		noSubscribers,
	};
}
