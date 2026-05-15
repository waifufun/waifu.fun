import assert from "node:assert/strict";
import test from "node:test";

import type { AgentLaunchRow } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { submitLaunchBundle } from "./bundle-submitter.js";

function makeDb(capture: { set?: Record<string, unknown>; whereCalled?: boolean }): Database {
	return {
		transaction: async (fn: (tx: { execute: () => Promise<[]> }) => Promise<unknown>) =>
			fn({ execute: async () => [] }),
		update: () => ({
			set(values: Record<string, unknown>) {
				capture.set = values;
				return {
					where() {
						capture.whereCalled = true;
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
	} as AgentLaunchRow;
}

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
