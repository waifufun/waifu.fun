/**
 * Unit tests for wallet-pool stuck-lock detection.
 *
 * Stub DB returns canned rows; we assert that wallets locked beyond the
 * stuck-threshold are flagged with a warn-log + counter bump.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { resetCountersForTests, snapshotCounters } from "./lib/metrics.js";
import { BUNDLE_WALLET_COOLDOWN_SECONDS, STUCK_MULTIPLIER, runWalletPoolHealthCheck } from "./wallet-pool-health.js";

interface FakeRow {
	address: string;
	nextAvailableTs: Date | null;
	isActive: boolean;
	balanceBnb: string | null;
}

function makeStubDb(rows: FakeRow[]) {
	return {
		select(_cols: Record<string, unknown>) {
			return {
				from(_table: unknown) {
					return Promise.resolve(rows);
				},
			};
		},
	};
}

function makeLogger() {
	const logs: Array<{ level: string; payload?: unknown; msg?: string }> = [];
	const capture = (level: string) => (payload: unknown, msg?: string) => {
		if (typeof payload === "string") logs.push({ level, msg: payload });
		else logs.push({ level, payload, msg });
	};
	return {
		logs,
		logger: {
			debug: capture("debug"),
			info: capture("info"),
			warn: capture("warn"),
			error: capture("error"),
			child() {
				return this;
			},
		} as never,
	};
}

const NOW_MS = 1_715_000_000_000;
const STUCK_THRESHOLD_MS = STUCK_MULTIPLIER * BUNDLE_WALLET_COOLDOWN_SECONDS * 1_000;

test("runWalletPoolHealthCheck: flags wallets locked beyond 5x cooldown", async () => {
	resetCountersForTests();
	const lockedFarAhead = new Date(NOW_MS + STUCK_THRESHOLD_MS + 60_000);
	const lockedNormally = new Date(NOW_MS + BUNDLE_WALLET_COOLDOWN_SECONDS * 1_000);
	const db = makeStubDb([
		{ address: "0xstuck", nextAvailableTs: lockedFarAhead, isActive: true, balanceBnb: "1.0" },
		{ address: "0xnormal", nextAvailableTs: lockedNormally, isActive: true, balanceBnb: "1.0" },
		{ address: "0xfree", nextAvailableTs: null, isActive: true, balanceBnb: "1.0" },
	]);
	const { logger, logs } = makeLogger();

	const result = await runWalletPoolHealthCheck({
		db: db as never,
		logger,
		nowMs: NOW_MS,
	});

	assert.equal(result.scanned, 3);
	assert.equal(result.stuck, 1);

	const warns = logs.filter((l) => l.level === "warn");
	assert.equal(warns.length, 1);

	const snap = snapshotCounters();
	assert.ok(
		snap.bundle_wallet_pool_stuck_seconds &&
			snap.bundle_wallet_pool_stuck_seconds > STUCK_MULTIPLIER * BUNDLE_WALLET_COOLDOWN_SECONDS,
	);
});

test("runWalletPoolHealthCheck: ignores inactive wallets even if locked far ahead", async () => {
	resetCountersForTests();
	const lockedFarAhead = new Date(NOW_MS + STUCK_THRESHOLD_MS * 10);
	const db = makeStubDb([{ address: "0xinactive", nextAvailableTs: lockedFarAhead, isActive: false, balanceBnb: "0" }]);
	const { logger } = makeLogger();

	const result = await runWalletPoolHealthCheck({ db: db as never, logger, nowMs: NOW_MS });
	assert.equal(result.scanned, 1);
	assert.equal(result.stuck, 0);
});

test("runWalletPoolHealthCheck: empty pool yields zero stuck", async () => {
	resetCountersForTests();
	const db = makeStubDb([]);
	const { logger } = makeLogger();
	const result = await runWalletPoolHealthCheck({ db: db as never, logger, nowMs: NOW_MS });
	assert.equal(result.scanned, 0);
	assert.equal(result.stuck, 0);
});

test("runWalletPoolHealthCheck: wallets exactly at threshold are not flagged", async () => {
	resetCountersForTests();
	const atThreshold = new Date(NOW_MS + STUCK_THRESHOLD_MS);
	const db = makeStubDb([{ address: "0xedge", nextAvailableTs: atThreshold, isActive: true, balanceBnb: "1.0" }]);
	const { logger } = makeLogger();
	const result = await runWalletPoolHealthCheck({ db: db as never, logger, nowMs: NOW_MS });
	assert.equal(result.stuck, 0);
});
