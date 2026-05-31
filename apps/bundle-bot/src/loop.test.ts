import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { AgentLaunchRow } from "@waifufun/db";
import type { Address, Hex } from "viem";

import { BUNDLE_GRACE_PERIOD_SECONDS, VAULT_STATE_CLOSED } from "./auto-refund.js";
import type { BundleBotConfig } from "./config.js";
import { type BundleFailedRefundDeps, pollOnce } from "./loop.js";

const NOW = 2_000_000_000n;
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
		dryRun: true,
		dryRunWriteStatus: false,
		walletPoolRequired: false,
		...overrides,
	};
}

function makeLogger() {
	const calls: { level: string; obj: object; msg?: string }[] = [];
	return {
		calls,
		info: (obj: object, msg?: string) => calls.push({ level: "info", obj, msg }),
		warn: (obj: object, msg?: string) => calls.push({ level: "warn", obj, msg }),
		error: (obj: object, msg?: string) => calls.push({ level: "error", obj, msg }),
	};
}

function makeLaunch(overrides: Partial<AgentLaunchRow> = {}): AgentLaunchRow {
	return {
		id: "launch-1",
		tokenAddress: "0x0000000000000000000000000000000000000001",
		vaultAddress: "0x0000000000000000000000000000000000000002",
		routerAddress: "0x0000000000000000000000000000000000000003",
		taxSplitterAddress: null,
		treasuryLpAddress: null,
		creator: "0x0000000000000000000000000000000000000004",
		tier: 80,
		presaleCap: "16000000000000000000",
		v2BuyBnb: "0",
		vestingEnabled: false,
		closeTimestamp: BigInt(Math.floor(Date.now() / 1000) - 60),
		metadataUri: null,
		predictedTokenAddress: "0x0000000000000000000000000000000000000005",
		vanitySalt: "0xdeadbeef",
		flapMetaCid: "QmTest",
		bundleStatus: "pending",
		bundleAttempt: 0,
		bundleTipBnb: null,
		bundleTxHash: null,
		bundleFailureReason: null,
		state: "open",
		createTxHash: null,
		createBlockNumber: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	} as AgentLaunchRow;
}

function makeBundleFailedRefundDeps(overrides: Partial<BundleFailedRefundDeps> = {}): BundleFailedRefundDeps {
	return {
		enabled: true,
		graceSeconds: BUNDLE_GRACE_PERIOD_SECONDS,
		nowSeconds: () => NOW,
		readVault: async () => ({ state: VAULT_STATE_CLOSED, bundleBot: BUNDLE_BOT }),
		resolveBundleBotKey: async () => FAKE_PK,
		sendRefundBundleFailed: async () => "0xtx",
		...overrides,
	};
}

describe("pollOnce", () => {
	it("scans 0 when no launches ready", async () => {
		const logger = makeLogger();
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig(),
			logger,
			listReady: async () => [],
			submit: async () => ({ status: "submitted", attempt: 1 }),
		});
		assert.equal(result.scanned, 0);
		assert.equal(result.submitted, 0);
		assert.equal(result.errors, 0);
	});

	it("skips launches missing predicted addr, salt, or meta CID", async () => {
		const logger = makeLogger();
		const launch = makeLaunch({ flapMetaCid: null });
		let submitCalled = false;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig(),
			logger,
			listReady: async () => [launch],
			submit: async () => {
				submitCalled = true;
				return { status: "submitted", attempt: 1 };
			},
		});
		assert.equal(result.scanned, 1);
		assert.equal(result.skipped, 1);
		assert.equal(result.submitted, 0);
		assert.equal(submitCalled, false);
		assert.ok(logger.calls.find((c) => c.level === "warn"));
	});

	it("submits a fully-prepared launch in dry-run mode", async () => {
		const logger = makeLogger();
		const launch = makeLaunch();
		let capturedDryRun: boolean | null = null;
		let capturedDryRunWriteStatus: boolean | null = null;
		let capturedMaxAttempts: number | null = null;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig({ dryRun: true, maxAttempts: 5 }),
			logger,
			listReady: async () => [launch],
			submit: async (_db, _launch, opts) => {
				capturedDryRun = opts.dryRun;
				capturedDryRunWriteStatus = opts.dryRunWriteStatus;
				capturedMaxAttempts = opts.maxAttempts;
				return { status: "submitted", attempt: 1, txHash: "0xabc" };
			},
		});
		assert.equal(result.submitted, 1);
		assert.equal(result.scanned, 1);
		assert.equal(capturedDryRun, true);
		assert.equal(capturedDryRunWriteStatus, false);
		assert.equal(capturedMaxAttempts, 5);
	});

	it("counts errors when submit throws", async () => {
		const logger = makeLogger();
		const launch = makeLaunch();
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig(),
			logger,
			listReady: async () => [launch],
			submit: async () => {
				throw new Error("rpc dropped");
			},
		});
		assert.equal(result.errors, 1);
		assert.ok(logger.calls.find((c) => c.level === "error"));
	});

	it("skips launches that exceeded max attempts", async () => {
		const logger = makeLogger();
		const launch = makeLaunch({ bundleAttempt: 3 });
		let submitCalled = false;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig({ maxAttempts: 3 }),
			logger,
			listReady: async () => [launch],
			submit: async () => {
				submitCalled = true;
				return { status: "submitted", attempt: 4 };
			},
		});
		assert.equal(result.skipped, 1);
		assert.equal(submitCalled, false);
	});

	it("counts failed_retry as failed", async () => {
		const logger = makeLogger();
		const launch = makeLaunch();
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig(),
			logger,
			listReady: async () => [launch],
			submit: async () => ({ status: "failed_retry", attempt: 1, reason: "puissant timeout" }),
		});
		assert.equal(result.failed, 1);
		assert.equal(result.submitted, 0);
	});

	it("respects batchSize when more launches are ready", async () => {
		const logger = makeLogger();
		const launches = Array.from({ length: 12 }, (_, i) => makeLaunch({ id: `launch-${i}` }));
		let submitCount = 0;
		await pollOnce({
			db: {} as never,
			config: makeConfig({ batchSize: 4 }),
			logger,
			listReady: async () => launches,
			submit: async () => {
				submitCount += 1;
				return { status: "submitted", attempt: 1 };
			},
		});
		assert.equal(submitCount, 4);
	});

	it("auto-enables bundle-failed refund after a terminal bundle failure", async () => {
		const logger = makeLogger();
		const launch = makeLaunch({ closeTimestamp: NOW - BUNDLE_GRACE_PERIOD_SECONDS - 1n });
		let resolvedAddress: Address | null = null;
		let sentVault: Address | null = null;
		let sentPk: Hex | null = null;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig({ dryRun: false, maxAttempts: 3 }),
			logger,
			listReady: async () => [launch],
			submit: async () => ({ status: "failed_terminal", attempt: 3, reason: "Puissant rejected tx" }),
			autoRefundBundleFailed: makeBundleFailedRefundDeps({
				resolveBundleBotKey: async (address) => {
					resolvedAddress = address;
					return FAKE_PK;
				},
				sendRefundBundleFailed: async (vault, pk) => {
					sentVault = vault;
					sentPk = pk;
					return "0xrefund";
				},
			}),
		});

		assert.equal(result.failed, 1);
		assert.equal(result.refundEnabled, 1);
		assert.equal(resolvedAddress, BUNDLE_BOT);
		assert.equal(sentVault, launch.vaultAddress);
		assert.equal(sentPk, FAKE_PK);
	});

	it("does not auto-enable bundle-failed refund when the feature flag is disabled", async () => {
		const logger = makeLogger();
		const launch = makeLaunch({ closeTimestamp: NOW - BUNDLE_GRACE_PERIOD_SECONDS - 1n });
		let readCalled = false;
		let keyResolved = false;
		let sent = false;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig({ dryRun: false }),
			logger,
			listReady: async () => [launch],
			submit: async () => ({ status: "failed_terminal", attempt: 3 }),
			autoRefundBundleFailed: makeBundleFailedRefundDeps({
				enabled: false,
				readVault: async () => {
					readCalled = true;
					return { state: VAULT_STATE_CLOSED, bundleBot: BUNDLE_BOT };
				},
				resolveBundleBotKey: async () => {
					keyResolved = true;
					return FAKE_PK;
				},
				sendRefundBundleFailed: async () => {
					sent = true;
					return "0xrefund";
				},
			}),
		});

		assert.equal(result.refundEnabled, 0);
		assert.equal(result.refundSkipped, 1);
		assert.equal(readCalled, false);
		assert.equal(keyResolved, false);
		assert.equal(sent, false);
	});

	it("does not resolve the bundleBot key or send in dry-run mode", async () => {
		const logger = makeLogger();
		const launch = makeLaunch({ closeTimestamp: NOW - BUNDLE_GRACE_PERIOD_SECONDS - 1n });
		let keyResolved = false;
		let sent = false;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig({ dryRun: true }),
			logger,
			listReady: async () => [launch],
			submit: async () => ({ status: "failed_terminal", attempt: 3 }),
			autoRefundBundleFailed: makeBundleFailedRefundDeps({
				resolveBundleBotKey: async () => {
					keyResolved = true;
					return FAKE_PK;
				},
				sendRefundBundleFailed: async () => {
					sent = true;
					return "0xrefund";
				},
			}),
		});

		assert.equal(result.refundEnabled, 0);
		assert.equal(result.refundSkipped, 1);
		assert.equal(keyResolved, false);
		assert.equal(sent, false);
	});

	it("waits for the bundle refund grace period before reading signer state", async () => {
		const logger = makeLogger();
		const launch = makeLaunch({ closeTimestamp: NOW - 10n });
		let readCalled = false;
		let keyResolved = false;
		let sent = false;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig({ dryRun: false }),
			logger,
			listReady: async () => [launch],
			submit: async () => ({ status: "failed_terminal", attempt: 3 }),
			autoRefundBundleFailed: makeBundleFailedRefundDeps({
				readVault: async () => {
					readCalled = true;
					return { state: VAULT_STATE_CLOSED, bundleBot: BUNDLE_BOT };
				},
				resolveBundleBotKey: async () => {
					keyResolved = true;
					return FAKE_PK;
				},
				sendRefundBundleFailed: async () => {
					sent = true;
					return "0xrefund";
				},
			}),
		});

		assert.equal(result.refundEnabled, 0);
		assert.equal(result.refundSkipped, 1);
		assert.equal(readCalled, false);
		assert.equal(keyResolved, false);
		assert.equal(sent, false);
	});

	it("skips bundle-failed refund when the registered bundleBot key is not held", async () => {
		const logger = makeLogger();
		const launch = makeLaunch({ closeTimestamp: NOW - BUNDLE_GRACE_PERIOD_SECONDS - 1n });
		let sent = false;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig({ dryRun: false }),
			logger,
			listReady: async () => [launch],
			submit: async () => ({ status: "failed_terminal", attempt: 3 }),
			autoRefundBundleFailed: makeBundleFailedRefundDeps({
				resolveBundleBotKey: async () => null,
				sendRefundBundleFailed: async () => {
					sent = true;
					return "0xrefund";
				},
			}),
		});

		assert.equal(result.refundEnabled, 0);
		assert.equal(result.refundSkipped, 1);
		assert.equal(sent, false);
	});
});

describe("config", () => {
	it("dryRun defaults to false outside NODE_ENV=test if BUNDLE_BOT_DRY_RUN is unset", async () => {
		const { loadBundleBotConfig } = await import("./config.js");
		const originalDryRun = process.env.BUNDLE_BOT_DRY_RUN;
		const originalNodeEnv = process.env.NODE_ENV;
		delete process.env.BUNDLE_BOT_DRY_RUN;
		process.env.NODE_ENV = "production";
		try {
			const c = loadBundleBotConfig();
			assert.equal(c.dryRun, false);
		} finally {
			if (originalDryRun !== undefined) process.env.BUNDLE_BOT_DRY_RUN = originalDryRun;
			else delete process.env.BUNDLE_BOT_DRY_RUN;
			if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
			else delete process.env.NODE_ENV;
		}
	});

	it("dryRun defaults to true under NODE_ENV=test", async () => {
		const { loadBundleBotConfig } = await import("./config.js");
		const originalDryRun = process.env.BUNDLE_BOT_DRY_RUN;
		const originalNodeEnv = process.env.NODE_ENV;
		delete process.env.BUNDLE_BOT_DRY_RUN;
		process.env.NODE_ENV = "test";
		try {
			const c = loadBundleBotConfig();
			assert.equal(c.dryRun, true);
		} finally {
			if (originalDryRun !== undefined) process.env.BUNDLE_BOT_DRY_RUN = originalDryRun;
			else delete process.env.BUNDLE_BOT_DRY_RUN;
			if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv;
			else delete process.env.NODE_ENV;
		}
	});

	it("dryRun is false when explicitly disabled", async () => {
		const { loadBundleBotConfig } = await import("./config.js");
		const original = process.env.BUNDLE_BOT_DRY_RUN;
		process.env.BUNDLE_BOT_DRY_RUN = "false";
		try {
			const c = loadBundleBotConfig();
			assert.equal(c.dryRun, false);
		} finally {
			if (original !== undefined) process.env.BUNDLE_BOT_DRY_RUN = original;
			else delete process.env.BUNDLE_BOT_DRY_RUN;
		}
	});

	it("dryRunWriteStatus only enables when dryRun is also enabled", async () => {
		const { loadBundleBotConfig } = await import("./config.js");
		const originalDryRun = process.env.BUNDLE_BOT_DRY_RUN;
		const originalWriteStatus = process.env.BUNDLE_BOT_DRY_RUN_WRITE_STATUS;
		try {
			process.env.BUNDLE_BOT_DRY_RUN = "true";
			process.env.BUNDLE_BOT_DRY_RUN_WRITE_STATUS = "true";
			assert.equal(loadBundleBotConfig().dryRunWriteStatus, true);

			process.env.BUNDLE_BOT_DRY_RUN = "false";
			assert.equal(loadBundleBotConfig().dryRunWriteStatus, false);
		} finally {
			if (originalDryRun !== undefined) process.env.BUNDLE_BOT_DRY_RUN = originalDryRun;
			else delete process.env.BUNDLE_BOT_DRY_RUN;
			if (originalWriteStatus !== undefined) process.env.BUNDLE_BOT_DRY_RUN_WRITE_STATUS = originalWriteStatus;
			else delete process.env.BUNDLE_BOT_DRY_RUN_WRITE_STATUS;
		}
	});
});
