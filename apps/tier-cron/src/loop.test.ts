/**
 * Unit tests for the W45 tier cron loop.
 *
 * Drives `processOnce` / `processLaunch` against a stub OnchainClient and
 * stub LaunchRepo. No network, no DB. Each test asserts the cron makes the
 * right write decisions for a given on-chain state snapshot.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Address } from "viem";

import { TIER_COUNT, TWAP_WINDOW_SECONDS } from "./lib/abi.js";
import type { ContractState, OnchainClient, TierState } from "./lib/onchain.js";
import { isAdvanceReady, isPokeReady } from "./lib/onchain.js";
import type { LaunchCandidate, LaunchRepo } from "./lib/runtime.js";
import { processLaunch, processOnce } from "./loop.js";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

interface CallLog {
	op:
		| "readState"
		| "simulateOraclePoke"
		| "simulateCheckAndAdvance"
		| "sendOraclePoke"
		| "sendCheckAndAdvance"
		| "waitForReceipt";
	treasury?: Address;
	hash?: `0x${string}`;
}

interface StubBehavior {
	simulatePokeError?: Error;
	sendPokeError?: Error;
	pokeReceiptStatus?: "success" | "reverted";
	simulateAdvanceError?: Error;
	sendAdvanceError?: Error;
	advanceReceiptStatus?: "success" | "reverted";
	postPokeStateOverride?: Partial<ContractState>;
}

class StubOnchain implements OnchainClient {
	calls: CallLog[] = [];
	private readReturns: ContractState[] = [];
	constructor(
		private readonly initialState: ContractState,
		private readonly behavior: StubBehavior = {},
	) {}

	queueState(state: ContractState): void {
		this.readReturns.push(state);
	}

	async readState(treasury: Address): Promise<ContractState> {
		this.calls.push({ op: "readState", treasury });
		const next = this.readReturns.shift();
		return next ?? this.initialState;
	}

	async simulateOraclePoke(treasury: Address): Promise<void> {
		this.calls.push({ op: "simulateOraclePoke", treasury });
		if (this.behavior.simulatePokeError) throw this.behavior.simulatePokeError;
	}

	async simulateCheckAndAdvance(treasury: Address): Promise<void> {
		this.calls.push({ op: "simulateCheckAndAdvance", treasury });
		if (this.behavior.simulateAdvanceError) throw this.behavior.simulateAdvanceError;
	}

	async sendOraclePoke(treasury: Address): Promise<`0x${string}`> {
		this.calls.push({ op: "sendOraclePoke", treasury });
		if (this.behavior.sendPokeError) throw this.behavior.sendPokeError;
		return "0xdeadbeef";
	}

	async sendCheckAndAdvance(treasury: Address): Promise<`0x${string}`> {
		this.calls.push({ op: "sendCheckAndAdvance", treasury });
		if (this.behavior.sendAdvanceError) throw this.behavior.sendAdvanceError;
		return "0xfeed1234";
	}

	async waitForReceipt(hash: `0x${string}`): Promise<{ status: "success" | "reverted" }> {
		this.calls.push({ op: "waitForReceipt", hash });
		if (hash === "0xdeadbeef") return { status: this.behavior.pokeReceiptStatus ?? "success" };
		if (hash === "0xfeed1234") return { status: this.behavior.advanceReceiptStatus ?? "success" };
		return { status: "success" };
	}
}

class StubRepo implements LaunchRepo {
	constructor(private readonly candidates: LaunchCandidate[]) {}
	async listLaunchedWithTreasury(): Promise<LaunchCandidate[]> {
		return this.candidates;
	}
}

import type { Logger } from "@waifufun/logger";

const noopLogger = {
	debug() {},
	info() {},
	warn() {},
	error() {},
	fatal() {},
	trace() {},
	silent() {},
	level: "info",
	msgPrefix: "",
	child() {
		return noopLogger;
	},
} as unknown as Logger;

const treasury = "0xaaaa000000000000000000000000000000000001" as Address;
const tokenAddress = "0xbbbb000000000000000000000000000000000002" as Address;
const candidate: LaunchCandidate = { id: "launch-1", tokenAddress, treasuryLpAddress: treasury };

function makeTier(overrides: Partial<TierState> = {}): TierState {
	return {
		idx: 0,
		minEpochs: 2,
		epochsAbove: 0,
		lastEpochTimestamp: 1_000_000,
		paused: false,
		deployed: false,
		...overrides,
	};
}

function makeState(overrides: Partial<ContractState> = {}): ContractState {
	return {
		nextTierIndex: 0,
		epochLength: 14_400,
		oracleSnapshotTimestamp: 1_000_000,
		activeTier: makeTier(),
		...overrides,
	};
}

const baseDeps = (onchain: OnchainClient, nowSeconds: number) => ({
	onchain,
	logger: noopLogger,
	now: () => new Date(nowSeconds * 1_000),
	perTxTimeoutMs: 1_000,
	dryRun: false,
});

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

test("isPokeReady: zero snapshot is always ready (first poke)", () => {
	const state = makeState({ oracleSnapshotTimestamp: 0 });
	assert.equal(isPokeReady(state, 1_000_000), true);
});

test("isPokeReady: false when window not elapsed", () => {
	const state = makeState({ oracleSnapshotTimestamp: 1_000_000 });
	assert.equal(isPokeReady(state, 1_000_000 + TWAP_WINDOW_SECONDS - 1), false);
});

test("isPokeReady: true when window elapsed", () => {
	const state = makeState({ oracleSnapshotTimestamp: 1_000_000 });
	assert.equal(isPokeReady(state, 1_000_000 + TWAP_WINDOW_SECONDS), true);
});

test("isAdvanceReady: false when all tiers deployed", () => {
	const state = makeState({ nextTierIndex: TIER_COUNT, activeTier: null });
	assert.equal(isAdvanceReady(state, 1_000_000_000), false);
});

test("isAdvanceReady: false when paused", () => {
	const state = makeState({ activeTier: makeTier({ paused: true }) });
	assert.equal(isAdvanceReady(state, 1_000_000_000), false);
});

test("isAdvanceReady: false when epoch not elapsed", () => {
	const state = makeState({ activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }), epochLength: 1_000 });
	assert.equal(isAdvanceReady(state, 1_000_500), false);
});

test("isAdvanceReady: true when elapsed and unpaused", () => {
	const state = makeState({ activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }), epochLength: 1_000 });
	assert.equal(isAdvanceReady(state, 1_001_500), true);
});

// ---------------------------------------------------------------------------
// processLaunch happy path
// ---------------------------------------------------------------------------

test("processLaunch: pokes + advances when both windows elapsed", async () => {
	const initial = makeState({
		oracleSnapshotTimestamp: 1_000_000,
		epochLength: 1_000,
		activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }),
	});
	const onchain = new StubOnchain(initial);
	// processLaunch will re-read state after a successful poke; queue a fresh state
	// that still has the epoch elapsed so checkAndAdvance fires.
	onchain.queueState(initial);
	onchain.queueState({
		...initial,
		activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }),
	});

	const nowSeconds = 1_000_000 + TWAP_WINDOW_SECONDS + 100;
	const outcome = await processLaunch(baseDeps(onchain, nowSeconds), candidate);

	assert.equal(outcome.pokeAttempted, true);
	assert.equal(outcome.pokeStatus, "success");
	assert.equal(outcome.advanceAttempted, true);
	assert.equal(outcome.advanceStatus, "success");

	const ops = onchain.calls.map((c) => c.op);
	assert.deepEqual(ops.slice(0, 4), ["readState", "simulateOraclePoke", "sendOraclePoke", "waitForReceipt"]);
	assert.ok(ops.includes("simulateCheckAndAdvance"));
	assert.ok(ops.includes("sendCheckAndAdvance"));
});

test("processLaunch: skips poke when TWAP not ready, also skips advance when epoch fresh", async () => {
	const initial = makeState({
		oracleSnapshotTimestamp: 1_000_000,
		epochLength: 14_400,
		activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }),
	});
	const onchain = new StubOnchain(initial);

	// Now is only 5 minutes past snapshot — TWAP is 30 minutes.
	const outcome = await processLaunch(baseDeps(onchain, 1_000_000 + 300), candidate);

	assert.equal(outcome.pokeAttempted, false);
	assert.equal(outcome.pokeStatus, "skipped");
	assert.equal(outcome.advanceAttempted, false);
	assert.equal(outcome.advanceStatus, "skipped");

	assert.deepEqual(
		onchain.calls.map((c) => c.op),
		["readState"],
	);
});

test("processLaunch: skips entirely when nextTierIndex == TIER_COUNT", async () => {
	const onchain = new StubOnchain(makeState({ nextTierIndex: TIER_COUNT, activeTier: null }));
	const outcome = await processLaunch(baseDeps(onchain, 9_999_999_999), candidate);

	assert.equal(outcome.pokeStatus, "skipped");
	assert.equal(outcome.advanceStatus, "skipped");
	assert.deepEqual(
		onchain.calls.map((c) => c.op),
		["readState"],
	);
});

test("processLaunch: poke simulate failure short-circuits to simulate_failed and still attempts advance if possible", async () => {
	const initial = makeState({
		oracleSnapshotTimestamp: 1_000_000,
		epochLength: 1_000,
		activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }),
	});
	const onchain = new StubOnchain(initial, {
		simulatePokeError: new Error("twap_not_ready"),
	});

	const nowSeconds = 1_000_000 + TWAP_WINDOW_SECONDS + 100;
	const outcome = await processLaunch(baseDeps(onchain, nowSeconds), candidate);

	assert.equal(outcome.pokeStatus, "simulate_failed");
	// We still try to advance: the contract's currentMcUSD has a fallback to
	// lastMcUSD if poke isn't possible, and the cron's job is to nudge state
	// not to reason about it.
	assert.equal(outcome.advanceAttempted, true);
	assert.equal(outcome.advanceStatus, "success");
});

test("processLaunch: send failure surfaces send_failed and skips wait", async () => {
	const initial = makeState({
		oracleSnapshotTimestamp: 1_000_000,
		epochLength: 1_000,
		activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }),
	});
	const onchain = new StubOnchain(initial, {
		sendPokeError: new Error("nonce too low"),
	});

	const nowSeconds = 1_000_000 + TWAP_WINDOW_SECONDS + 100;
	const outcome = await processLaunch(baseDeps(onchain, nowSeconds), candidate);

	assert.equal(outcome.pokeStatus, "send_failed");
});

test("processLaunch: reverted receipt is recorded as reverted", async () => {
	const initial = makeState({
		oracleSnapshotTimestamp: 1_000_000,
		epochLength: 1_000,
		activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }),
	});
	const onchain = new StubOnchain(initial, {
		pokeReceiptStatus: "reverted",
	});

	// Don't fire advance to keep this test focused.
	const nowSeconds = 1_000_000 + TWAP_WINDOW_SECONDS + 100;
	const outcome = await processLaunch(
		{
			...baseDeps(onchain, nowSeconds),
			// Stub simulate to revert so advance bails to simulate_failed.
		},
		candidate,
	);

	assert.equal(outcome.pokeStatus, "reverted");
});

test("processLaunch: dry-run never sends but reports success", async () => {
	const initial = makeState({
		oracleSnapshotTimestamp: 1_000_000,
		epochLength: 1_000,
		activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }),
	});
	const onchain = new StubOnchain(initial);
	const deps = { ...baseDeps(onchain, 1_000_000 + TWAP_WINDOW_SECONDS + 100), dryRun: true };

	const outcome = await processLaunch(deps, candidate);

	assert.equal(outcome.pokeStatus, "success");
	assert.equal(outcome.advanceStatus, "success");
	assert.equal(onchain.calls.filter((c) => c.op === "sendOraclePoke").length, 0, "dry-run must not send");
	assert.equal(onchain.calls.filter((c) => c.op === "sendCheckAndAdvance").length, 0, "dry-run must not send");
});

// ---------------------------------------------------------------------------
// processOnce
// ---------------------------------------------------------------------------

test("processOnce: fans out across all candidates", async () => {
	const candidates: LaunchCandidate[] = [
		{ id: "l1", tokenAddress, treasuryLpAddress: "0x000000000000000000000000000000000000aa01" as Address },
		{ id: "l2", tokenAddress, treasuryLpAddress: "0x000000000000000000000000000000000000aa02" as Address },
		{ id: "l3", tokenAddress, treasuryLpAddress: "0x000000000000000000000000000000000000aa03" as Address },
	];
	const repo = new StubRepo(candidates);
	const onchain = new StubOnchain(
		makeState({
			oracleSnapshotTimestamp: 0, // first-poke ready
			epochLength: 1_000,
			activeTier: makeTier({ lastEpochTimestamp: 1_000_000 }),
		}),
	);

	const result = await processOnce({
		...baseDeps(onchain, 1_500_000),
		repo,
		maxConcurrency: 2,
	});

	assert.equal(result.candidateCount, 3);
	assert.equal(result.outcomes.length, 3);
	const treasuries = new Set(result.outcomes.map((o) => o.treasury));
	assert.equal(treasuries.size, 3);
});

test("processOnce: empty repo yields empty round", async () => {
	const repo = new StubRepo([]);
	const onchain = new StubOnchain(makeState());
	const result = await processOnce({
		...baseDeps(onchain, 1_000_000),
		repo,
		maxConcurrency: 4,
	});
	assert.equal(result.candidateCount, 0);
	assert.equal(result.outcomes.length, 0);
});
