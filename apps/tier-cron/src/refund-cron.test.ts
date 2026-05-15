/**
 * Unit tests for the auto-refund cron.
 *
 * Drives `runAutoRefundCron` against a stub repo + stub viem clients so
 * we can pin down: eligibility filter, under-subscribed check, simulate
 * revert handling, feature flag gating, no-signer gating, dry-run gating.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Address, Hash } from "viem";

import { resetCountersForTests, snapshotCounters } from "./lib/metrics.js";
import type { LaunchRepo, StuckLaunchCandidate, TierCronRuntime } from "./lib/runtime.js";
import { runAutoRefundCron } from "./refund-cron.js";

interface StubRepo extends LaunchRepo {
	stuck: StuckLaunchCandidate[];
}

interface ReadBehavior {
	totalDeposited?: bigint;
	presaleCap?: bigint;
	readError?: Error;
}

interface SimBehavior {
	simulateReverts?: boolean;
	simulateRevertReason?: string;
	simulateError?: Error;
	sendError?: Error;
	sendResult?: Hash;
}

function makeRuntime(opts: {
	stuck: StuckLaunchCandidate[];
	readBehavior?: ReadBehavior;
	simBehavior?: SimBehavior;
	hasWallet?: boolean;
	dryRun?: boolean;
}): { runtime: TierCronRuntime; logs: Array<{ level: string; payload?: unknown; msg?: string }> } {
	const logs: Array<{ level: string; payload?: unknown; msg?: string }> = [];
	const capture = (level: string) => (payload: unknown, msg?: string) => {
		if (typeof payload === "string") logs.push({ level, msg: payload });
		else logs.push({ level, payload, msg });
	};
	const logger = {
		debug: capture("debug"),
		info: capture("info"),
		warn: capture("warn"),
		error: capture("error"),
		child() {
			return logger;
		},
	} as unknown as TierCronRuntime["logger"];

	const repo: StubRepo = {
		stuck: opts.stuck,
		async listLaunchedWithTreasury() {
			return [];
		},
		async listStuckLaunches() {
			return opts.stuck;
		},
	};

	const readBehavior = opts.readBehavior ?? {};
	const simBehavior = opts.simBehavior ?? {};
	const publicClient = {
		async readContract({ functionName }: { functionName: string }) {
			if (readBehavior.readError) throw readBehavior.readError;
			if (functionName === "totalDeposited") return readBehavior.totalDeposited ?? 100n;
			if (functionName === "presaleCap") return readBehavior.presaleCap ?? 1000n;
			throw new Error(`unexpected readContract: ${functionName}`);
		},
		async simulateContract() {
			if (simBehavior.simulateError) throw simBehavior.simulateError;
			if (simBehavior.simulateReverts) {
				const e = new Error("reverted");
				// minimal viem-ish shape for decodeRevertReason fallback
				throw e;
			}
			return { request: {} };
		},
	} as unknown as TierCronRuntime["publicClient"];

	let walletClient: TierCronRuntime["walletClient"];
	if (opts.hasWallet ?? true) {
		walletClient = {
			account: { address: "0xbeef000000000000000000000000000000000001" as Address },
			chain: { id: 56 },
			async writeContract() {
				if (simBehavior.sendError) throw simBehavior.sendError;
				return (simBehavior.sendResult ?? "0xdeadbeef") as Hash;
			},
		} as unknown as TierCronRuntime["walletClient"];
	}

	const runtime = {
		logger,
		config: {
			chainId: 56,
			rpcUrl: "https://example.invalid",
			signerPrivateKey: opts.hasWallet === false ? undefined : `0x${"01".repeat(32)}`,
			pollIntervalMs: 1,
			perTxTimeoutMs: 1_000,
			maxConcurrency: 1,
			dryRun: opts.dryRun ?? false,
		},
		publicClient,
		walletClient,
		signerAddress: opts.hasWallet === false ? undefined : ("0xbeef000000000000000000000000000000000001" as Address),
		repo,
	} as unknown as TierCronRuntime;

	return { runtime, logs };
}

function stuckCandidate(over: Partial<StuckLaunchCandidate> = {}): StuckLaunchCandidate {
	return {
		id: "launch-1",
		vaultAddress: "0xaa00000000000000000000000000000000000001" as Address,
		routerAddress: "0xbb00000000000000000000000000000000000001" as Address,
		state: "closed",
		bundleStatus: "pending",
		bundleAttempt: 1,
		closeTimestamp: 1_700_000_000n,
		secondsStuck: 50_000n,
		...over,
	};
}

const NOW = 1_700_060_000n;
const STUCK_SECONDS = 12n * 60n * 60n;

// ---------------------------------------------------------------------------
// Eligibility filter
// ---------------------------------------------------------------------------

test("runAutoRefundCron: skips launches not in eligible bundleStatus", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({ stuck: [stuckCandidate({ bundleStatus: "confirmed" })] });
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.scanned, 1);
	assert.equal(result.skippedNotEligible, 1);
	assert.equal(result.sent, 0);
});

test("runAutoRefundCron: skips launches already in launched/failed state", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({ stuck: [stuckCandidate({ state: "launched" })] });
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.skippedNotEligible, 1);
	assert.equal(result.sent, 0);
});

// ---------------------------------------------------------------------------
// Under-subscribed check
// ---------------------------------------------------------------------------

test("runAutoRefundCron: skips fully-subscribed launches (totalDeposited >= presaleCap)", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({
		stuck: [stuckCandidate()],
		readBehavior: { totalDeposited: 1500n, presaleCap: 1000n },
	});
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.skippedNotEligible, 1);
	assert.equal(result.sent, 0);
});

// ---------------------------------------------------------------------------
// Feature flag + signer gating
// ---------------------------------------------------------------------------

test("runAutoRefundCron: simulates but does NOT send when feature flag is off", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({
		stuck: [stuckCandidate()],
		readBehavior: { totalDeposited: 100n, presaleCap: 1000n },
	});
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: false, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.scanned, 1);
	assert.equal(result.skippedFlagOff, 1);
	assert.equal(result.sent, 0);
	const snap = snapshotCounters();
	assert.equal(snap.tier_cron_auto_refund_simulated_total, 1);
});

test("runAutoRefundCron: simulates but skips when no wallet client is configured", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({
		stuck: [stuckCandidate()],
		readBehavior: { totalDeposited: 100n, presaleCap: 1000n },
		hasWallet: false,
	});
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.skippedNoSigner, 1);
	assert.equal(result.sent, 0);
});

test("runAutoRefundCron: dry-run mode skips send", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({
		stuck: [stuckCandidate()],
		readBehavior: { totalDeposited: 100n, presaleCap: 1000n },
		dryRun: true,
	});
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.skippedDryRun, 1);
	assert.equal(result.sent, 0);
});

// ---------------------------------------------------------------------------
// Happy path send
// ---------------------------------------------------------------------------

test("runAutoRefundCron: sends enableRefundUnderSubscribed when flagged, signed, and under-subscribed", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({
		stuck: [stuckCandidate()],
		readBehavior: { totalDeposited: 100n, presaleCap: 1000n },
	});
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.scanned, 1);
	assert.equal(result.sent, 1);
	assert.equal(result.errors, 0);
	const snap = snapshotCounters();
	assert.equal(snap.tier_cron_auto_refund_sent_total, 1);
});

// ---------------------------------------------------------------------------
// Simulation revert (already-refunded launch)
// ---------------------------------------------------------------------------

test("runAutoRefundCron: treats simulate revert as no-op (already REFUND/LAUNCHED)", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({
		stuck: [stuckCandidate()],
		readBehavior: { totalDeposited: 100n, presaleCap: 1000n },
		simBehavior: { simulateReverts: true },
	});
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.skippedSimulationReverted, 1);
	assert.equal(result.sent, 0);
});

// ---------------------------------------------------------------------------
// Vault read failure
// ---------------------------------------------------------------------------

test("runAutoRefundCron: counts vault read errors and continues", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({
		stuck: [stuckCandidate(), stuckCandidate({ id: "launch-2" })],
		readBehavior: { readError: new Error("rpc down") },
	});
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.errors, 2);
	assert.equal(result.sent, 0);
});

// ---------------------------------------------------------------------------
// Send failure
// ---------------------------------------------------------------------------

test("runAutoRefundCron: counts send errors and bumps failed metric", async () => {
	resetCountersForTests();
	const { runtime } = makeRuntime({
		stuck: [stuckCandidate()],
		readBehavior: { totalDeposited: 100n, presaleCap: 1000n },
		simBehavior: { sendError: new Error("nonce too low") },
	});
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.errors, 1);
	assert.equal(result.sent, 0);
	const snap = snapshotCounters();
	assert.equal(snap.tier_cron_auto_refund_failed_total, 1);
});

// ---------------------------------------------------------------------------
// Empty repo (no listStuckLaunches impl)
// ---------------------------------------------------------------------------

test("runAutoRefundCron: returns zeroes if repo lacks listStuckLaunches", async () => {
	const runtime = {
		logger: {
			debug() {},
			info() {},
			warn() {},
			error() {},
		} as unknown as TierCronRuntime["logger"],
		config: { dryRun: false, perTxTimeoutMs: 1000 },
		publicClient: {} as unknown as TierCronRuntime["publicClient"],
		walletClient: undefined,
		signerAddress: undefined,
		repo: {
			async listLaunchedWithTreasury() {
				return [];
			},
		} as LaunchRepo,
	} as unknown as TierCronRuntime;
	const result = await runAutoRefundCron(runtime, { nowSeconds: NOW, enabled: true, stuckSeconds: STUCK_SECONDS });
	assert.equal(result.scanned, 0);
});
