/**
 * Notification trigger poller.
 *
 * Single sweep over `agent_launches` derives the lifecycle events that need
 * to fire and hands each one to the dispatcher. Idempotency lives in the
 * `launch_notifications` table, not here, so the poller is allowed to be
 * over-eager.
 *
 * Event derivation rules (per launch row):
 *
 *   - round_opened: any time we see a launch (state in {open, closed,
 *     launched}). The dispatcher dedupes on first delivery.
 *   - cap_hit: total_deposited >= presale_cap, regardless of state.
 *   - launched: state == "launched".
 *   - summary_24h: state == "launched" AND launch_timestamp + summaryDelayMs
 *     <= now.
 *   - tranche_deployed: NOT EMITTED here. Reserved for the indexer-driven
 *     trigger once on-chain tranche events are wired up.
 */

import type { AgentLaunchRow, LaunchNotificationEventType } from "@waifufun/db";

import { dispatchEvent } from "../lib/dispatcher.js";
import type { NotifierRuntime, PendingEvent } from "../lib/types.js";

export interface PollSummary {
	scanned: number;
	dispatched: number;
	skipped: number;
	failed: number;
	byEvent: Partial<Record<LaunchNotificationEventType, number>>;
}

export function deriveEvents(launch: AgentLaunchRow, now: Date, summaryDelayMs: number): PendingEvent[] {
	const events: PendingEvent[] = [];

	// round_opened: we always emit on first sight; dispatcher dedupes.
	events.push({
		launch,
		eventType: "round_opened",
		occurredAt: launch.createdAt,
		context: {},
	});

	// cap_hit: deposits >= cap.
	if (depositsHitCap(launch)) {
		events.push({
			launch,
			eventType: "cap_hit",
			occurredAt: launch.updatedAt,
			context: {},
		});
	}

	if (launch.state === "launched") {
		const launchedAt =
			launch.launchTimestamp != null ? new Date(Number(launch.launchTimestamp) * 1_000) : launch.updatedAt;
		events.push({
			launch,
			eventType: "launched",
			occurredAt: launchedAt,
			context: {},
		});

		// summary_24h: only after summaryDelayMs has elapsed since launch.
		if (now.getTime() - launchedAt.getTime() >= summaryDelayMs) {
			events.push({
				launch,
				eventType: "summary_24h",
				occurredAt: now,
				context: {},
			});
		}
	}

	return events;
}

function depositsHitCap(launch: AgentLaunchRow): boolean {
	try {
		const cap = BigInt(launch.presaleCap);
		const dep = BigInt(launch.totalDeposited);
		return cap > 0n && dep >= cap;
	} catch {
		return false;
	}
}

export async function pollOnce(runtime: NotifierRuntime): Promise<PollSummary> {
	const now = runtime.now();
	const launches = await runtime.repo.listAgentLaunches();
	const summary: PollSummary = {
		scanned: launches.length,
		dispatched: 0,
		skipped: 0,
		failed: 0,
		byEvent: {},
	};

	for (const launch of launches) {
		const events = deriveEvents(launch, now, runtime.config.summaryDelayMs);
		for (const event of events) {
			try {
				const result = await dispatchEvent(runtime, event);
				summary.dispatched += result.dispatched;
				summary.skipped += result.skipped;
				summary.failed += result.failed;
				summary.byEvent[event.eventType] = (summary.byEvent[event.eventType] ?? 0) + result.dispatched;
			} catch (error) {
				summary.failed += 1;
				runtime.logger.error(
					{
						launchId: launch.id,
						eventType: event.eventType,
						err: error instanceof Error ? error.message : String(error),
					},
					"dispatchEvent threw",
				);
			}
		}
	}

	return summary;
}
