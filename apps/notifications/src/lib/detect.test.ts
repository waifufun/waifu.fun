/**
 * Unit tests for `detectEvents`. Verifies idempotency, threshold ordering,
 * and the 24h post-launch summary gate.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { detectEvents } from "./detect.js";
import type { AlreadySentLookup, LaunchSnapshot } from "./types.js";

const ONE_BNB = 10n ** 18n;

function snapshot(overrides: Partial<LaunchSnapshot> = {}): LaunchSnapshot {
	return {
		id: "L1",
		tokenAddress: "0xaaaa",
		vaultAddress: "0xbbbb",
		creator: "0xcccc",
		tier: 90,
		state: "open",
		presaleCap: 100n * ONE_BNB,
		totalDeposited: 0n,
		depositorCount: 0,
		closeTimestamp: 0n,
		launchTimestamp: null,
		v2Pair: null,
		tokenName: "Foo",
		tokenTicker: "FOO",
		tokenImageUrl: null,
		createdAt: new Date("2026-05-01T00:00:00Z"),
		...overrides,
	};
}

class FakeAlreadySent implements AlreadySentLookup {
	private readonly set = new Set<string>();
	add(launchId: string, eventType: string, channel: string, dedupeKey: string): this {
		this.set.add(`${launchId}:${eventType}:${channel}:${dedupeKey}`);
		return this;
	}
	has(launchId: string, eventType: string, channel: string, dedupeKey: string): boolean {
		return this.set.has(`${launchId}:${eventType}:${channel}:${dedupeKey}`);
	}
	hasNoSubscriberSentinel(_launchId: string, _eventType: string, _dedupeKey: string): boolean {
		return false;
	}
}

const TRANCHES = [2_500, 5_000, 7_500, 10_000];

test("fresh open launch fires only round_opened", () => {
	const events = detectEvents(snapshot(), new FakeAlreadySent(), {
		trancheBpsThresholds: TRANCHES,
		now: new Date("2026-05-08T12:00:00Z"),
	});
	assert.equal(events.length, 1);
	assert.equal(events[0]?.eventType, "round_opened");
});

test("50% deposited fires round_opened + T1 + T2 in order", () => {
	const events = detectEvents(snapshot({ totalDeposited: 50n * ONE_BNB }), new FakeAlreadySent(), {
		trancheBpsThresholds: TRANCHES,
		now: new Date(),
	});
	const types = events.map((e) => e.eventType);
	assert.deepEqual(types, ["round_opened", "tranche_deployed", "tranche_deployed"]);
	const tranches = events
		.filter((e) => e.eventType === "tranche_deployed")
		.map((e) => (e.detail.kind === "tranche_deployed" ? e.detail.trancheIndex : -1));
	assert.deepEqual(tranches, [1, 2]);
});

test("cap fully filled fires round_opened + all tranches + cap_hit", () => {
	const events = detectEvents(snapshot({ totalDeposited: 100n * ONE_BNB }), new FakeAlreadySent(), {
		trancheBpsThresholds: TRANCHES,
		now: new Date(),
	});
	const types = events.map((e) => e.eventType);
	assert.deepEqual(types, [
		"round_opened",
		"tranche_deployed",
		"tranche_deployed",
		"tranche_deployed",
		"tranche_deployed",
		"cap_hit",
	]);
});

test("already-sent round_opened is suppressed", () => {
	const already = new FakeAlreadySent().add("L1", "round_opened", "discord", "");
	const events = detectEvents(snapshot(), already, {
		trancheBpsThresholds: TRANCHES,
		now: new Date(),
	});
	assert.equal(events.length, 0);
});

test("partial tranche dedupe – T1 sent, T2 still fires", () => {
	const already = new FakeAlreadySent()
		.add("L1", "round_opened", "discord", "")
		.add("L1", "tranche_deployed", "discord", "t1");
	const events = detectEvents(snapshot({ totalDeposited: 60n * ONE_BNB }), already, {
		trancheBpsThresholds: TRANCHES,
		now: new Date(),
	});
	assert.equal(events.length, 1);
	assert.equal(events[0]?.eventType, "tranche_deployed");
	if (events[0]?.detail.kind === "tranche_deployed") {
		assert.equal(events[0].detail.trancheIndex, 2);
	} else {
		throw new Error("expected tranche_deployed detail");
	}
});

test("launched state fires `launched` event when not yet recorded", () => {
	const already = new FakeAlreadySent()
		.add("L1", "round_opened", "discord", "")
		.add("L1", "tranche_deployed", "discord", "t1")
		.add("L1", "tranche_deployed", "discord", "t2")
		.add("L1", "tranche_deployed", "discord", "t3")
		.add("L1", "tranche_deployed", "discord", "t4")
		.add("L1", "cap_hit", "discord", "");
	const events = detectEvents(
		snapshot({
			state: "launched",
			totalDeposited: 100n * ONE_BNB,
			launchTimestamp: BigInt(Math.floor(Date.now() / 1_000)),
			v2Pair: "0xdddd",
		}),
		already,
		{ trancheBpsThresholds: TRANCHES, now: new Date() },
	);
	const types = events.map((e) => e.eventType);
	assert.deepEqual(types, ["launched"]);
});

test("summary_24h is gated on >= 24h since launch_timestamp", () => {
	const launchTs = BigInt(Math.floor(new Date("2026-05-01T00:00:00Z").getTime() / 1_000));
	const already = new FakeAlreadySent()
		.add("L1", "round_opened", "discord", "")
		.add("L1", "tranche_deployed", "discord", "t1")
		.add("L1", "tranche_deployed", "discord", "t2")
		.add("L1", "tranche_deployed", "discord", "t3")
		.add("L1", "tranche_deployed", "discord", "t4")
		.add("L1", "cap_hit", "discord", "")
		.add("L1", "launched", "discord", "");

	// 12h after launch: no summary.
	const tooEarly = detectEvents(
		snapshot({ state: "launched", totalDeposited: 100n * ONE_BNB, launchTimestamp: launchTs }),
		already,
		{ trancheBpsThresholds: TRANCHES, now: new Date("2026-05-01T12:00:00Z") },
	);
	assert.equal(tooEarly.length, 0);

	// 25h after launch: summary fires.
	const justAfter = detectEvents(
		snapshot({ state: "launched", totalDeposited: 100n * ONE_BNB, launchTimestamp: launchTs }),
		already,
		{ trancheBpsThresholds: TRANCHES, now: new Date("2026-05-02T01:00:00Z") },
	);
	assert.equal(justAfter.length, 1);
	assert.equal(justAfter[0]?.eventType, "summary_24h");
});

test("zero presaleCap defends against div-by-zero", () => {
	const events = detectEvents(snapshot({ presaleCap: 0n, totalDeposited: 0n }), new FakeAlreadySent(), {
		trancheBpsThresholds: TRANCHES,
		now: new Date(),
	});
	// Only round_opened; no tranches, no cap_hit.
	const types = events.map((e) => e.eventType);
	assert.deepEqual(types, ["round_opened"]);
});
