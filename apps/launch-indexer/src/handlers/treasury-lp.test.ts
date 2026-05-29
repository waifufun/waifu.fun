/**
 * Handler-level unit tests for the TreasuryLP4 dispatcher (gap F16,
 * waifufun#599).
 *
 * `handleTreasuryLpEvent` flattens every indexed TreasuryLP4 event into one
 * `treasury_lp_events` row. These tests pin the discriminator + promoted
 * columns (tierIdx, agentSafe) and confirm the full decoded args land in
 * `payload`. The insert is idempotent on (tx_hash, log_index, block_hash),
 * which we assert is part of the captured values.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { BnbClaimedEvent, BuybackExecutedEvent, TierDeployedEvent, TreasuryLpEvent } from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";
import { handleTreasuryLpEvent } from "./treasury-lp.js";

type Row = Record<string, unknown>;

class FakeDb {
	public inserts: Row[] = [];

	insert(_table: unknown) {
		const captures = this.inserts;
		return {
			values(value: Row) {
				captures.push(value);
				return {
					onConflictDoNothing() {
						return Promise.resolve([]);
					},
				};
			},
		};
	}
}

function makeRuntime(): { runtime: LaunchIndexerRuntime; db: FakeDb } {
	const db = new FakeDb();
	const noop = () => {};
	const childLogger = {
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
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
	return { runtime, db };
}

const TREASURY = "0x7777777777777777777777777777777777777777";
const AGENT_SAFE = "0x9999999999999999999999999999999999999999";

function baseEnvelope<T extends TreasuryLpEvent["eventName"]>(eventName: T) {
	return {
		eventName,
		chainId: 56,
		contractAddress: TREASURY as `0x${string}`,
		blockNumber: 1000n,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1" as `0x${string}`,
		txHash: "0xabc" as `0x${string}`,
		logIndex: 4,
		blockTimestamp: new Date("2026-05-13T00:00:00Z"),
	};
}

test("handleTreasuryLpEvent: TierDeployed promotes tierIdx, payload carries full args", async () => {
	const { runtime, db } = makeRuntime();
	const event: TierDeployedEvent = {
		...baseEnvelope("TierDeployed"),
		data: { tierIdx: 3, positionId: "123", liquidity: "999", tokenAmount: "1000000" },
	};

	await handleTreasuryLpEvent(runtime, event, { launchId: "launch-1" });

	assert.equal(db.inserts.length, 1);
	const row = db.inserts[0] ?? {};
	assert.equal(row.launchId, "launch-1");
	assert.equal(row.eventKind, "TierDeployed");
	assert.equal(row.treasuryLpAddress, TREASURY.toLowerCase());
	assert.equal(row.tierIdx, 3);
	assert.equal(row.agentSafeAddress, null);
	assert.equal(row.txHash, "0xabc");
	assert.equal(row.blockHash, event.blockHash);
	assert.equal(row.logIndex, 4);
	assert.deepEqual(row.payload, event.data);
});

test("handleTreasuryLpEvent: BnbClaimed promotes agentSafe (lowercased), no tierIdx", async () => {
	const { runtime, db } = makeRuntime();
	const event: BnbClaimedEvent = {
		...baseEnvelope("BnbClaimed"),
		data: {
			agentSafe: AGENT_SAFE as `0x${string}`,
			bnbToAgent: "10",
			bnbBuyback: "20",
			bnbPlatform: "30",
			bnbPatron: "40",
		},
	};

	await handleTreasuryLpEvent(runtime, event, { launchId: "launch-2" });

	const row = db.inserts[0] ?? {};
	assert.equal(row.eventKind, "BnbClaimed");
	assert.equal(row.tierIdx, null);
	assert.equal(row.agentSafeAddress, AGENT_SAFE.toLowerCase());
	assert.deepEqual(row.payload, event.data);
});

test("handleTreasuryLpEvent: BuybackExecuted has neither promoted column", async () => {
	const { runtime, db } = makeRuntime();
	const event: BuybackExecutedEvent = {
		...baseEnvelope("BuybackExecuted"),
		data: { bnbSpent: "5", tokensBurned: "7" },
	};

	await handleTreasuryLpEvent(runtime, event, { launchId: "launch-3" });

	const row = db.inserts[0] ?? {};
	assert.equal(row.eventKind, "BuybackExecuted");
	assert.equal(row.tierIdx, null);
	assert.equal(row.agentSafeAddress, null);
	assert.deepEqual(row.payload, { bnbSpent: "5", tokensBurned: "7" });
});
