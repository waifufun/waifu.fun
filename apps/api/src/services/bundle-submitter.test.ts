import assert from "node:assert/strict";
import test from "node:test";

import type { AgentLaunchRow } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { buildBundleExecParams, markBundleReceipt, submitLaunchBundle } from "./bundle-submitter.js";

function makeDb(capture: {
	set?: Record<string, unknown>;
	updates?: Record<string, unknown>[];
	whereCalled?: boolean;
}): Database {
	let launchClaimed = false;
	return {
		transaction: async (fn: (tx: { execute: () => Promise<[]> }) => Promise<unknown>) =>
			fn({ execute: async () => [] }),
		update: () => ({
			set(values: Record<string, unknown>) {
				capture.set = values;
				capture.updates?.push(values);
				return {
					where() {
						capture.whereCalled = true;
						if (values.bundleStatus === "submitting") {
							return {
								returning: async () => {
									if (launchClaimed) return [];
									launchClaimed = true;
									return [{ id: "00000000-0000-0000-0000-000000000001" }];
								},
							};
						}
						return Promise.resolve();
					},
				};
			},
		}),
	} as unknown as Database;
}

function launchFixture(): AgentLaunchRow {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		predictedTokenAddress: "0x0000000000000000000000000000000000007777",
		vanitySalt: `0x${"01".repeat(32)}`,
		flapMetaCid: "bafy-test",
		routerAddress: "0x00000000000000000000000000000000000000bb",
		bundleStatus: "pending",
		bundleAttempt: 0,
		bundleTipBnb: "0.03",
		bundleTxHash: null,
		metadata: { name: "Test Waifu", symbol: "TWAIFU" },
		creator: "0x0000000000000000000000000000000000000001",
	} as unknown as AgentLaunchRow;
}

test("submitLaunchBundle atomically claims a pending launch before submission", async () => {
	const capture: { set?: Record<string, unknown>; updates: Record<string, unknown>[]; whereCalled?: boolean } = {
		updates: [],
	};
	const launch = launchFixture();
	const db = makeDb(capture);

	const first = await submitLaunchBundle(db, launch, { dryRun: true, useWalletPool: false });
	const second = await submitLaunchBundle(db, launch, { dryRun: true, useWalletPool: false });

	assert.equal(first.status, "submitted");
	assert.equal(first.attempt, 1);
	assert.equal(second.status, "pending");
	assert.equal(second.attempt, 0);
	assert.equal(second.reason, "bundle_submission_already_claimed");
	assert.equal(capture.updates.filter((update) => update.bundleStatus === "submitting").length, 2);
	assert.equal(capture.updates.filter((update) => update.bundleStatus === "submitted").length, 1);
});

test("submitLaunchBundle leaves launch pending when wallet pool is exhausted and fallback is required off", async () => {
	const oldPk = process.env.BUNDLE_BOT_PK;
	delete process.env.BUNDLE_BOT_PK;
	const capture: { set?: Record<string, unknown>; whereCalled?: boolean } = {};
	try {
		const result = await submitLaunchBundle(makeDb(capture), launchFixture(), {
			useWalletPool: true,
			allowSingleWalletFallback: false,
		});
		assert.equal(result.status, "pending");
		assert.equal(result.reason, "bundle_wallet_pool_exhausted");
		assert.equal(capture.whereCalled, true);
		assert.equal(capture.set?.bundleStatus, "pending");
		assert.match(String(capture.set?.bundleFailureReason), /bundle wallet pool exhausted/u);
	} finally {
		if (oldPk != null) process.env.BUNDLE_BOT_PK = oldPk;
	}
});

test("submitLaunchBundle uses configured maxAttempts before terminalizing failures", async () => {
	const oldPk = process.env.BUNDLE_BOT_PK;
	delete process.env.BUNDLE_BOT_PK;
	const capture: { set?: Record<string, unknown>; whereCalled?: boolean } = {};
	try {
		const launch = { ...launchFixture(), bundleAttempt: 2, bundleStatus: "failed_retry" } as AgentLaunchRow;
		const result = await submitLaunchBundle(makeDb(capture), launch, {
			dryRun: false,
			bundleBotPrivateKey: `0x${"11".repeat(32)}`,
			useWalletPool: false,
			allowSingleWalletFallback: true,
			maxAttempts: 5,
		});
		assert.equal(result.status, "failed_retry");
		assert.equal(result.attempt, 3);
		assert.equal(capture.set?.bundleStatus, "failed_retry");
	} finally {
		if (oldPk != null) process.env.BUNDLE_BOT_PK = oldPk;
	}
});

test("markBundleReceipt uses configured maxAttempts before terminalizing reverted receipts", async () => {
	const capture: { set?: Record<string, unknown>; whereCalled?: boolean } = {};
	const launch = { ...launchFixture(), bundleAttempt: 3 } as AgentLaunchRow;
	const status = await markBundleReceipt(makeDb(capture), launch, { status: "reverted" }, { maxAttempts: 5 });
	assert.equal(status, "failed_retry");
	assert.equal(capture.set?.bundleStatus, "failed_retry");
});

test("buildBundleExecParams passes raw vanity salt and contract-compatible metadata", () => {
	const launch = launchFixture();
	const params = buildBundleExecParams(launch, {
		commissionReceiver: "0x00000000000000000000000000000000000000cc",
		deadlineSeconds: 60,
	});
	assert.equal(params.vanitySalt, launch.vanitySalt);
	assert.equal(params.name, "Test Waifu");
	assert.equal(params.symbol, "TWAIFU");
	assert.equal(params.meta, "bafy-test");
	assert.equal(params.tipBnb, 0n);
});
