import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { AgentLaunchRow } from "@waifufun/db";

import type { BundleBotConfig } from "./config.js";
import { pollOnce } from "./loop.js";

function makeConfig(overrides: Partial<BundleBotConfig> = {}): BundleBotConfig {
	return {
		chainId: 56,
		rpcUrl: "http://rpc.example",
		puissantUrl: "https://puissant.example",
		pollIntervalMs: 30_000,
		batchSize: 8,
		maxAttempts: 3,
		dryRun: true,
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
		let capturedMaxAttempts: number | null = null;
		const result = await pollOnce({
			db: {} as never,
			config: makeConfig({ dryRun: true, maxAttempts: 5 }),
			logger,
			listReady: async () => [launch],
			submit: async (_db, _launch, opts) => {
				capturedDryRun = opts.dryRun;
				capturedMaxAttempts = opts.maxAttempts;
				return { status: "submitted", attempt: 1, txHash: "0xabc" };
			},
		});
		assert.equal(result.submitted, 1);
		assert.equal(result.scanned, 1);
		assert.equal(capturedDryRun, true);
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
});

describe("config", () => {
	it("dryRun defaults to true if BUNDLE_BOT_DRY_RUN is unset", async () => {
		const { loadBundleBotConfig } = await import("./config.js");
		const original = process.env.BUNDLE_BOT_DRY_RUN;
		delete process.env.BUNDLE_BOT_DRY_RUN;
		try {
			const c = loadBundleBotConfig();
			assert.equal(c.dryRun, true);
		} finally {
			if (original !== undefined) process.env.BUNDLE_BOT_DRY_RUN = original;
		}
	});

	it("dryRun is false only when explicitly set", async () => {
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
});
