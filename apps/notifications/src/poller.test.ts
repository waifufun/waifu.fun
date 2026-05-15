/**
 * End-to-end poller test using an in-memory repository + a recording sender.
 *
 * Verifies:
 *   - `pollOnce` runs detect → dispatch → record loop
 *   - dedupe stops the next tick from re-sending
 *   - tranche fan-out emits per-threshold dedupe rows
 *   - "no subscribers" path still inserts a sentinel row so the event is not
 *     re-detected forever.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createNotificationsConfig } from "./lib/config.js";
import type { ChannelSender } from "./lib/dispatcher.js";
import type { NotificationsRepository } from "./lib/repository.js";
import type {
	AlreadySentLookup,
	Channel,
	EventType,
	LaunchSnapshot,
	NotificationLogInput,
	PendingEvent,
	SubscriptionRecord,
} from "./lib/types.js";
import { pollOnce } from "./poller.js";

const ONE_BNB = 10n ** 18n;

class FakeAlreadySent implements AlreadySentLookup {
	constructor(private readonly keys: Set<string>) {}
	has(launchId: string, eventType: EventType, channel: Channel, dedupeKey: string): boolean {
		return this.keys.has(`${launchId}:${eventType}:${channel}:${dedupeKey}`);
	}
}

class FakeRepo implements NotificationsRepository {
	launches: LaunchSnapshot[] = [];
	subscriptions: SubscriptionRecord[] = [];
	sent: NotificationLogInput[] = [];

	async listLaunches(_limit: number): Promise<LaunchSnapshot[]> {
		return this.launches;
	}
	async listSubscriptions(launchIds: string[]): Promise<SubscriptionRecord[]> {
		return this.subscriptions.filter((s) => launchIds.includes(s.launchId));
	}
	async loadAlreadySent(_launchIds: string[]): Promise<AlreadySentLookup> {
		const keys = new Set<string>();
		for (const row of this.sent) {
			keys.add(`${row.launchId}:${row.eventType}:${row.channel}:${row.dedupeKey}`);
		}
		return new FakeAlreadySent(keys);
	}
	async recordSend(input: NotificationLogInput): Promise<void> {
		const key = `${input.launchId}:${input.eventType}:${input.channel}:${input.dedupeKey}`;
		// Mirror the unique index – a duplicate insert is a no-op.
		if (this.sent.some((r) => `${r.launchId}:${r.eventType}:${r.channel}:${r.dedupeKey}` === key)) {
			return;
		}
		this.sent.push(input);
	}
}

class RecordingSender implements ChannelSender {
	calls: Array<{ channel: Channel; event: PendingEvent; subscription: SubscriptionRecord }> = [];
	constructor(private readonly status: "sent" | "failed" = "sent") {}
	async send(args: {
		channel: Channel;
		subscription: SubscriptionRecord;
		event: PendingEvent;
		botTokenFallback: string | undefined;
	}): Promise<{
		result: { status: "sent" | "failed" | "skipped"; statusCode: string; errorMessage: string | null };
		payload: Record<string, unknown>;
		webhookUrl: string | null;
	}> {
		this.calls.push({ channel: args.channel, event: args.event, subscription: args.subscription });
		return {
			result: {
				status: this.status,
				statusCode: this.status === "sent" ? "204" : "500",
				errorMessage: this.status === "sent" ? null : "fake failure",
			},
			payload: { test: true },
			webhookUrl: args.channel === "discord" ? args.subscription.target : null,
		};
	}
}

const silentLogger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	debug: () => undefined,
	trace: () => undefined,
	fatal: () => undefined,
	level: "silent",
} as unknown as Parameters<typeof pollOnce>[0]["logger"];

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

test("pollOnce sends round_opened to a discord subscriber and dedupes on second tick", async () => {
	const repo = new FakeRepo();
	repo.launches = [snapshot()];
	repo.subscriptions = [
		{
			launchId: "L1",
			channel: "discord",
			target: "https://discord.test/webhook",
			botToken: null,
			eventFilter: null,
		},
	];
	const sender = new RecordingSender("sent");
	const cfg = createNotificationsConfig({ NOTIFICATIONS_RUN_ONCE: "1" } as NodeJS.ProcessEnv);

	const r1 = await pollOnce({ repo, sender, cfg, logger: silentLogger, now: () => new Date("2026-05-08T00:00:00Z") });
	assert.equal(r1.launchesScanned, 1);
	assert.equal(r1.pendingEvents, 1);
	assert.equal(r1.sent, 1);
	assert.equal(repo.sent.length, 1);
	assert.equal(repo.sent[0]?.eventType, "round_opened");
	assert.equal(repo.sent[0]?.dedupeKey, "");
	assert.equal(repo.sent[0]?.status, "sent");

	// Second tick: already-sent lookup blocks the event.
	const r2 = await pollOnce({ repo, sender, cfg, logger: silentLogger, now: () => new Date("2026-05-08T00:01:00Z") });
	assert.equal(r2.pendingEvents, 0);
	assert.equal(sender.calls.length, 1, "sender not invoked on second tick");
});

test("tranche thresholds dispatch one event per crossed threshold", async () => {
	const repo = new FakeRepo();
	repo.launches = [snapshot({ totalDeposited: 75n * ONE_BNB })];
	repo.subscriptions = [
		{
			launchId: "L1",
			channel: "discord",
			target: "https://discord.test/webhook",
			botToken: null,
			eventFilter: null,
		},
	];
	const sender = new RecordingSender("sent");
	const cfg = createNotificationsConfig({} as NodeJS.ProcessEnv);

	const result = await pollOnce({
		repo,
		sender,
		cfg,
		logger: silentLogger,
		now: () => new Date("2026-05-08T00:00:00Z"),
	});
	// round_opened + T1 + T2 + T3 = 4 events
	assert.equal(result.pendingEvents, 4);
	const trancheRows = repo.sent.filter((r) => r.eventType === "tranche_deployed");
	const trancheKeys = trancheRows.map((r) => r.dedupeKey).sort();
	assert.deepEqual(trancheKeys, ["t1", "t2", "t3"]);
});

test("no-subscriber events still record a sentinel skip row", async () => {
	const repo = new FakeRepo();
	repo.launches = [snapshot()];
	repo.subscriptions = []; // no subscribers
	const sender = new RecordingSender("sent");
	const cfg = createNotificationsConfig({} as NodeJS.ProcessEnv);

	const r1 = await pollOnce({ repo, sender, cfg, logger: silentLogger });
	assert.equal(r1.noSubscribers, 1);
	assert.equal(repo.sent.length, 1);
	assert.equal(repo.sent[0]?.status, "skipped");

	// Re-detection doesn't fire a second sentinel because the row exists.
	const r2 = await pollOnce({ repo, sender, cfg, logger: silentLogger });
	assert.equal(r2.pendingEvents, 0);
	assert.equal(repo.sent.length, 1);
});

test("event filter on subscription suppresses non-matching event types", async () => {
	const repo = new FakeRepo();
	repo.launches = [snapshot({ totalDeposited: 100n * ONE_BNB, state: "launched", launchTimestamp: 0n })];
	repo.subscriptions = [
		{
			launchId: "L1",
			channel: "discord",
			target: "https://discord.test/webhook",
			botToken: null,
			eventFilter: ["launched"],
		},
	];
	const sender = new RecordingSender("sent");
	const cfg = createNotificationsConfig({} as NodeJS.ProcessEnv);

	await pollOnce({ repo, sender, cfg, logger: silentLogger, now: () => new Date("2026-05-08T00:00:00Z") });
	const sentEvents = sender.calls.map((c) => c.event.eventType);
	assert.ok(sentEvents.includes("launched"));
	assert.ok(!sentEvents.includes("round_opened"));
});

test("dispatcher records failures so we don't retry indefinitely", async () => {
	const repo = new FakeRepo();
	repo.launches = [snapshot()];
	repo.subscriptions = [
		{
			launchId: "L1",
			channel: "discord",
			target: "https://bad.example/webhook",
			botToken: null,
			eventFilter: null,
		},
	];
	const sender = new RecordingSender("failed");
	const cfg = createNotificationsConfig({} as NodeJS.ProcessEnv);

	const r1 = await pollOnce({ repo, sender, cfg, logger: silentLogger });
	assert.equal(r1.failed, 1);
	assert.equal(repo.sent[0]?.status, "failed");

	// Failure row still exists, so the dedupe lookup blocks redelivery.
	sender.calls = [];
	const r2 = await pollOnce({ repo, sender, cfg, logger: silentLogger });
	assert.equal(r2.pendingEvents, 0);
	assert.equal(sender.calls.length, 0);
});
