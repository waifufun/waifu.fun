/**
 * P2 followup: handler-level unit tests for the Flap portal handlers.
 *
 * `handlePortalTokenCreated` and `handleFlapLaunchedToDex` were only
 * exercised indirectly via the round-trip poller test. These tests pin
 * down field-by-field DB writes and cover the predicted-address mismatch
 * path (gap #20) that previously no-op'd silently.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { FlapLaunchedToDexEvent, PortalTokenCreatedEvent } from "../lib/events.js";
import { getCounter, resetCountersForTests, snapshotCounters } from "../lib/metrics.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";
import { handleFlapLaunchedToDex, handlePortalTokenCreated } from "./flap.js";

// ---------------------------------------------------------------------------
// Minimal fake DB just for these two handlers. Both follow the same shape:
// `select().from(table).where(...).limit(1)` then optionally
// `update(table).set({...}).where(...)`. We capture writes per row.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface LogEntry {
	level: "debug" | "info" | "warn" | "error";
	payload: Record<string, unknown> | undefined;
	message: string | undefined;
}

class FakeDb {
	private rows: Row[];
	public updates: Array<{ patch: Row }> = [];
	constructor(rows: Row[]) {
		this.rows = rows;
	}

	select(_cols: Record<string, unknown>) {
		const rows = this.rows;
		return {
			from(_table: unknown) {
				return {
					where(_predicate: unknown) {
						return {
							limit(_n: number) {
								return Promise.resolve(rows.slice(0, 1));
							},
						};
					},
				};
			},
		};
	}

	update(_table: unknown) {
		const captures = this.updates;
		return {
			set(value: Row) {
				return {
					where(_predicate: unknown) {
						captures.push({ patch: value });
						return Promise.resolve([]);
					},
				};
			},
		};
	}
}

function makeRuntime(rows: Row[]): {
	runtime: LaunchIndexerRuntime;
	logs: LogEntry[];
	db: FakeDb;
} {
	const db = new FakeDb(rows);
	const logs: LogEntry[] = [];
	const captureLogger = (level: LogEntry["level"]) =>
		((payload: Record<string, unknown> | string | undefined, message?: string) => {
			if (typeof payload === "string") {
				logs.push({ level, payload: undefined, message: payload });
			} else {
				logs.push({ level, payload, message });
			}
		}) as unknown;
	const childLogger = {
		debug: captureLogger("debug"),
		info: captureLogger("info"),
		warn: captureLogger("warn"),
		error: captureLogger("error"),
		child() {
			return childLogger;
		},
	};
	const runtime = {
		db: db as unknown as LaunchIndexerRuntime["db"],
		logger: childLogger as unknown as LaunchIndexerRuntime["logger"],
		cursors: undefined as unknown as LaunchIndexerRuntime["cursors"],
		source: undefined as unknown as LaunchIndexerRuntime["source"],
		config: {} as LaunchIndexerRuntime["config"],
	};
	return { runtime, logs, db };
}

const TOKEN = "0x4444444444444444444444444444444444444444";
const PAIR = "0x6666666666666666666666666666666666666666";
const CREATOR = "0xaa00000000000000000000000000000000000001";

function portalEvent(token: string): PortalTokenCreatedEvent {
	return {
		eventName: "TokenCreated",
		chainId: 56,
		contractAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
		blockNumber: 1000n,
		txHash: "0xtok" as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date("2026-05-13T00:00:00Z"),
		data: {
			ts: "1715551200",
			creator: CREATOR as `0x${string}`,
			nonce: "42",
			token: token as `0x${string}`,
			name: "Test Token",
			symbol: "TT",
			meta: "ipfs://meta",
		},
	};
}

function dexEvent(token: string, pair: string): FlapLaunchedToDexEvent {
	return {
		eventName: "LaunchedToDEX",
		chainId: 56,
		contractAddress: token as `0x${string}`,
		blockNumber: 1010n,
		txHash: "0xdex" as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date("2026-05-13T00:10:00Z"),
		data: { token: token as `0x${string}`, pair: pair as `0x${string}`, quoteAmt: "5000000000000000000" },
	};
}

// ---------------------------------------------------------------------------
// handlePortalTokenCreated
// ---------------------------------------------------------------------------

test("handlePortalTokenCreated: writes flap fields when predicted address matches", async () => {
	resetCountersForTests();
	const { runtime, db } = makeRuntime([{ id: "launch-1", predictedTokenAddress: TOKEN }]);

	const result = await handlePortalTokenCreated(runtime, portalEvent(TOKEN));

	assert.deepEqual(result, { launchId: "launch-1" });
	assert.equal(db.updates.length, 1);
	const patch = db.updates[0]?.patch ?? {};
	assert.equal(patch.flapTokenAddress, TOKEN.toLowerCase());
	assert.equal(patch.state, "launched");
	assert.equal(patch.bundleStatus, "confirmed");
	assert.equal(typeof patch.launchTimestamp, "bigint");
	assert.equal(patch.launchTimestamp, 1715551200n);
	assert.ok(patch.updatedAt instanceof Date);
	assert.equal(getCounter("indexer_portal_token_created_unmatched_total"), 0);
});

test("handlePortalTokenCreated: warns + bumps metric on predicted-address mismatch (gap #20)", async () => {
	resetCountersForTests();
	const { runtime, logs, db } = makeRuntime([]); // no matching row

	const result = await handlePortalTokenCreated(runtime, portalEvent(TOKEN));

	assert.equal(result, null);
	assert.equal(db.updates.length, 0, "should not write to DB on mismatch");

	const warn = logs.find((l) => l.level === "warn");
	assert.ok(warn, "expected a warn log");
	assert.match(warn?.message ?? "", /gap #20|no matching predicted/);

	const snapshot = snapshotCounters();
	assert.equal(snapshot.indexer_portal_token_created_unmatched_total, 1);
});

// ---------------------------------------------------------------------------
// handleFlapLaunchedToDex
// ---------------------------------------------------------------------------

test("handleFlapLaunchedToDex: writes v2Pair + curveFillBnb + state when launch row exists", async () => {
	resetCountersForTests();
	const { runtime, db } = makeRuntime([{ id: "launch-2", flapTokenAddress: TOKEN }]);

	const result = await handleFlapLaunchedToDex(runtime, dexEvent(TOKEN, PAIR));

	assert.deepEqual(result, { launchId: "launch-2" });
	assert.equal(db.updates.length, 1);
	const patch = db.updates[0]?.patch ?? {};
	assert.equal(patch.v2Pair, PAIR.toLowerCase());
	assert.equal(patch.curveFillBnb, "5000000000000000000");
	assert.equal(patch.state, "launched");
});

test("handleFlapLaunchedToDex: warns + bumps metric when launch row missing", async () => {
	resetCountersForTests();
	const { runtime, logs, db } = makeRuntime([]);

	const result = await handleFlapLaunchedToDex(runtime, dexEvent(TOKEN, PAIR));

	assert.equal(result, null);
	assert.equal(db.updates.length, 0);
	const warn = logs.find((l) => l.level === "warn");
	assert.ok(warn);
	assert.equal(getCounter("indexer_flap_launched_to_dex_unmatched_total"), 1);
});
