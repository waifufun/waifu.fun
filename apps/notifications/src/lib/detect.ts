/**
 * Detect which lifecycle events should fire for a given launch snapshot,
 * filtered against the set already delivered (`alreadySent`).
 *
 * Pure function: input snapshots + dedupe lookup → ordered list of
 * `PendingEvent` per (launch, eventType, dedupeKey). Channel fan-out happens
 * later in the dispatcher.
 */

import type { AlreadySentLookup, EventDetail, EventType, LaunchSnapshot, PendingEvent } from "./types.js";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;

export interface DetectOptions {
	trancheBpsThresholds: readonly number[];
	now: Date;
}

function hasReached(launch: LaunchSnapshot, bps: number): boolean {
	if (launch.presaleCap === 0n) return false;
	const target = (launch.presaleCap * BigInt(bps)) / 10_000n;
	return launch.totalDeposited >= target;
}

function isCapHit(launch: LaunchSnapshot): boolean {
	return launch.presaleCap > 0n && launch.totalDeposited >= launch.presaleCap;
}

function eventAlreadySentForAllChannels(
	already: AlreadySentLookup,
	launchId: string,
	eventType: EventType,
	dedupeKey: string,
): boolean {
	// We treat the event as "handled" if a row exists for any known channel.
	// The per-channel dedupe index is the source of truth at write time.
	return (
		already.has(launchId, eventType, "discord", dedupeKey) || already.has(launchId, eventType, "telegram", dedupeKey)
	);
}

/**
 * Decide which events fire for a launch. Order matters – callers may rely
 * on it for log readability.
 */
export function detectEvents(launch: LaunchSnapshot, already: AlreadySentLookup, opts: DetectOptions): PendingEvent[] {
	const out: PendingEvent[] = [];

	// 1. round_opened: emit once per launch the first time we see it.
	if (!eventAlreadySentForAllChannels(already, launch.id, "round_opened", "")) {
		out.push({
			launch,
			eventType: "round_opened",
			detail: { kind: "round_opened" } satisfies EventDetail,
		});
	}

	// 2. tranche_deployed: emit one event per BPS threshold crossed, in order.
	for (let i = 0; i < opts.trancheBpsThresholds.length; i++) {
		const bps = opts.trancheBpsThresholds[i];
		if (bps === undefined) continue;
		if (!hasReached(launch, bps)) continue;
		const trancheIndex = i + 1;
		const trancheKey = `t${trancheIndex}`;
		if (eventAlreadySentForAllChannels(already, launch.id, "tranche_deployed", trancheKey)) {
			continue;
		}
		out.push({
			launch,
			eventType: "tranche_deployed",
			detail: { kind: "tranche_deployed", trancheIndex, trancheBps: bps },
		});
	}

	// 3. cap_hit: emit once when total >= cap.
	if (isCapHit(launch) && !eventAlreadySentForAllChannels(already, launch.id, "cap_hit", "")) {
		out.push({
			launch,
			eventType: "cap_hit",
			detail: { kind: "cap_hit", capBps: 10_000 },
		});
	}

	// 4. launched: emit once when state transitions to "launched".
	if (launch.state === "launched" && !eventAlreadySentForAllChannels(already, launch.id, "launched", "")) {
		out.push({
			launch,
			eventType: "launched",
			detail: { kind: "launched" },
		});
	}

	// 5. summary_24h: emit once at >= 24h after launch_timestamp.
	if (
		launch.state === "launched" &&
		launch.launchTimestamp != null &&
		!eventAlreadySentForAllChannels(already, launch.id, "summary_24h", "")
	) {
		const launchedAtMs = Number(launch.launchTimestamp) * 1_000;
		if (opts.now.getTime() - launchedAtMs >= TWENTY_FOUR_HOURS_MS) {
			out.push({
				launch,
				eventType: "summary_24h",
				detail: { kind: "summary_24h" },
			});
		}
	}

	return out;
}
