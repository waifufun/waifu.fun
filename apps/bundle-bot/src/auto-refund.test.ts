import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { AgentLaunchRow } from "@waifufun/db";
import type { Address, Hex } from "viem";

import { type AutoRefundDeps, BUNDLE_GRACE_PERIOD_SECONDS, VAULT_STATE_CLOSED, runAutoRefund } from "./auto-refund.js";
import type { BundleBotConfig } from "./config.js";

const VAULT = "0x0000000000000000000000000000000000000002" as Address;
const BUNDLE_BOT = "0x00000000000000000000000000000000000000bb" as Address;
const FAKE_PK = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

function makeConfig(overrides: Partial<BundleBotConfig> = {}): BundleBotConfig {
	return {
		chainId: 56,
		rpcUrl: "http://rpc.example",
		puissantUrl: "https://puissant.example",
		pollIntervalMs: 30_000,
		batchSize: 8,
		maxAttempts: 3,
		dryRun: false,
		dryRunWriteStatus: false,
		walletPoolRequired: false,
		...overrides,
	};
}

function makeLogger() {
	const calls: { level: string; obj: Record<string, unknown>; msg?: string }[] = [];
	return {
		calls,
		info: (obj: object, msg?: string) => calls.push({ level: "info", obj: obj as Record<string, unknown>, msg }),
		warn: (obj: object, msg?: string) => calls.push({ level: "warn", obj: obj as Record<string, unknown>, msg }),
		error: (obj: object, msg?: string) => calls.push({ level: "error", obj: obj as Record<string, unknown>, msg }),
	};
}

const NOW = 2_000_000_000n;
// Closed well before the grace window so launches are eligible by default.
const CLOSED_LONG_AGO = NOW - BUNDLE_GRACE_PERIOD_SECONDS - 100n;

function makeLaunch(overrides: Partial<AgentLaunchRow> = {}): AgentLaunchRow {
	return {
		id: "launch-1",
		vaultAddress: VAULT,
		state: "closed",
		bundleStatus: "failed_terminal",
		bundleAttempt: 3,
		closeTimestamp: CLOSED_LONG_AGO,
		...overrides,
	} as AgentLaunchRow;
}

function makeDeps(overrides: Partial<AutoRefundDeps> = {}): AutoRefundDeps {
	return {
		db: {} as never,
		config: makeConfig(),
		logger: makeLogger(),
		enabled: true,
		nowSeconds: NOW,
		graceSeconds: BUNDLE_GRACE_PERIOD_SECONDS,
		listCandidates: async () => [makeLaunch()],
		readVault: async () => ({ state: VAULT_STATE_CLOSED, bundleBot: BUNDLE_BOT }),
		resolveBundleBotKey: async () => null,
		resolveAnyPoolKey: async () => FAKE_PK,
		sendRefund: async () => "0xtx",
		...overrides,
	};
}

describe("runAutoRefund", () => {
	it("scans 0 when no candidates", async () => {
		const out = await runAutoRefund(makeDeps({ listCandidates: async () => [] }));
		assert.equal(out.scanned, 0);
		assert.equal(out.sentBundleFailed, 0);
		assert.equal(out.sentLaunchExpired, 0);
	});

	it("uses the gated call when the pool holds the registered bundleBot key", async () => {
		let calledFn: string | null = null;
		const out = await runAutoRefund(
			makeDeps({
				resolveBundleBotKey: async () => FAKE_PK,
				sendRefund: async (_vault, fn) => {
					calledFn = fn;
					return "0xabc";
				},
			}),
		);
		assert.equal(calledFn, "enableRefundBundleFailed");
		assert.equal(out.sentBundleFailed, 1);
		assert.equal(out.sentLaunchExpired, 0);
	});

	it("falls back to the permissionless call when the bundleBot key is not held", async () => {
		let calledFn: string | null = null;
		const out = await runAutoRefund(
			makeDeps({
				resolveBundleBotKey: async () => null,
				resolveAnyPoolKey: async () => FAKE_PK,
				sendRefund: async (_vault, fn) => {
					calledFn = fn;
					return "0xabc";
				},
			}),
		);
		assert.equal(calledFn, "enableRefundLaunchExpired");
		assert.equal(out.sentLaunchExpired, 1);
		assert.equal(out.sentBundleFailed, 0);
	});

	it("does not resolve a signer or send when the feature flag is off", async () => {
		let keyResolved = false;
		let anyKeyResolved = false;
		let sent = false;
		const out = await runAutoRefund(
			makeDeps({
				enabled: false,
				resolveBundleBotKey: async () => {
					keyResolved = true;
					return FAKE_PK;
				},
				resolveAnyPoolKey: async () => {
					anyKeyResolved = true;
					return FAKE_PK;
				},
				sendRefund: async () => {
					sent = true;
					return "0xabc";
				},
			}),
		);
		assert.equal(sent, false);
		assert.equal(keyResolved, false);
		assert.equal(anyKeyResolved, false);
		assert.equal(out.skippedFlagOff, 1);
	});

	it("does not resolve a signer or send in dry-run mode", async () => {
		let keyResolved = false;
		let anyKeyResolved = false;
		let sent = false;
		const out = await runAutoRefund(
			makeDeps({
				config: makeConfig({ dryRun: true }),
				resolveBundleBotKey: async () => {
					keyResolved = true;
					return FAKE_PK;
				},
				resolveAnyPoolKey: async () => {
					anyKeyResolved = true;
					return FAKE_PK;
				},
				sendRefund: async () => {
					sent = true;
					return "0xabc";
				},
			}),
		);
		assert.equal(sent, false);
		assert.equal(keyResolved, false);
		assert.equal(anyKeyResolved, false);
		assert.equal(out.skippedDryRun, 1);
	});

	it("skips vaults no longer in CLOSED state", async () => {
		let sent = false;
		const out = await runAutoRefund(
			makeDeps({
				readVault: async () => ({ state: 3, bundleBot: BUNDLE_BOT }), // REFUND
				sendRefund: async () => {
					sent = true;
					return "0xabc";
				},
			}),
		);
		assert.equal(sent, false);
		assert.equal(out.skippedNotClosed, 1);
	});

	it("skips launches still inside the grace window", async () => {
		let readCalled = false;
		const out = await runAutoRefund(
			makeDeps({
				listCandidates: async () => [makeLaunch({ closeTimestamp: NOW - 10n })],
				readVault: async () => {
					readCalled = true;
					return { state: VAULT_STATE_CLOSED, bundleBot: BUNDLE_BOT };
				},
			}),
		);
		assert.equal(out.skippedWithinGrace, 1);
		assert.equal(readCalled, false);
	});

	it("counts an error and continues when no signer is available", async () => {
		const out = await runAutoRefund(
			makeDeps({
				resolveBundleBotKey: async () => null,
				resolveAnyPoolKey: async () => null,
			}),
		);
		assert.equal(out.errors, 1);
		assert.equal(out.sentBundleFailed, 0);
		assert.equal(out.sentLaunchExpired, 0);
	});

	it("counts an error when sendRefund throws", async () => {
		const out = await runAutoRefund(
			makeDeps({
				resolveBundleBotKey: async () => FAKE_PK,
				sendRefund: async () => {
					throw new Error("rpc dropped");
				},
			}),
		);
		assert.equal(out.errors, 1);
	});

	it("counts an error when the vault read fails", async () => {
		const out = await runAutoRefund(
			makeDeps({
				readVault: async () => {
					throw new Error("rpc timeout");
				},
			}),
		);
		assert.equal(out.errors, 1);
	});
});
