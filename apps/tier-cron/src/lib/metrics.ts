/**
 * minimal in-process counter registry mirroring
 * apps/launch-indexer/src/lib/metrics.ts. emits via logger on each bump so
 * downstream log scrapers can recover the time series.
 */

import type { Logger } from "@waifufun/logger";

const counters = new Map<string, number>();

export function bumpCounter(logger: Logger, name: string, by = 1, labels?: Record<string, unknown>): number {
	const prev = counters.get(name) ?? 0;
	const next = prev + by;
	counters.set(name, next);
	logger.info({ metric: name, value: next, delta: by, labels }, "metric");
	return next;
}

export function getCounter(name: string): number {
	return counters.get(name) ?? 0;
}

export function resetCountersForTests(): void {
	counters.clear();
}

export function snapshotCounters(): Record<string, number> {
	return Object.fromEntries(counters.entries());
}
