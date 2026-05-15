/**
 * minimal in-process counter registry. emits via the indexer logger on
 * increment so any log scraper (datadog, loki, etc) can pick the events up
 * without us adding a real metrics dependency.
 *
 * scope is deliberately tiny: a `bump(name, by?, labels?)` and a `snapshot()`
 * for tests. if/when we need a prometheus endpoint we can swap the impl
 * here without touching call sites.
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
