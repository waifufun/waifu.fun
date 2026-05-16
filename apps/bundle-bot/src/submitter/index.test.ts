import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { AgentLaunchRow } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { BundleSubmitterError, buildBundleExecParams, markBundleReceipt, submitLaunchBundle } from "./index.js";
import { decryptBundleWalletPk } from "./wallet-pool.js";

const TEST_PK = `0x${"11".repeat(32)}` as const;
const TEST_WALLET = "0x0000000000000000000000000000000000000001";

function launchFixture(overrides: Partial<AgentLaunchRow> = {}): AgentLaunchRow {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		tokenAddress: "0x0000000000000000000000000000000000000002",
		vaultAddress: "0x0000000000000000000000000000000000000003",
		routerAddress: "0x0000000000000000000000000000000000000004",
		taxSplitterAddress: null,
		treasuryLpAddress: null,
		creator: "0x0000000000000000000000000000000000000005",
		tier: 80,
		presaleCap: "16000000000000000000",
		v2BuyBnb: "0",
		vestingEnabled: 0,
		closeTimestamp: 1n,
		metadataUri: null,
		predictedTokenAddress: "0x0000000000000000000000000000000000007777",
		vanitySalt: `0x${"01".repeat(32)}`,
		flapMetaCid: "bafy-test",
		flapTokenAddress: null,
		bundleStatus: "pending",
		bundleAttempt: 0,
		bundleTipBnb: "0.03",
		bundleTxHash: null,
		bundleFailureReason: null,
		state: "closed",
		totalDeposited: "0",
		bonusPool: "0",
		depositorCount: 0,
		launchTimestamp: null,
		v2Pair: null,
		openMcBnb: null,
		curveFillBnb: null,
		tokensFromV2: null,
		tokensBurned: null,
		metadata: { name: "Test Waifu", symbol: "TWAIFU" },
		createTxHash: null,
		createBlockNumber: null,
		failureReason: null,
		createdAt: new Date("2026-05-16T00:00:00Z"),
		updatedAt: new Date("2026-05-16T00:00:00Z"),
		...overrides,
	} as AgentLaunchRow;
}

function makeDb(
	options: {
		walletRow?: { address: string; encrypted_pk: string } | null;
	} = {},
): { db: Database; updates: Record<string, unknown>[] } {
	let launchClaimed = false;
	const updates: Record<string, unknown>[] = [];

	function makeUpdate() {
		return {
			set(values: Record<string, unknown>) {
				updates.push(values);
				return {
					where() {
						if (values.bundleStatus !== "submitting") return Promise.resolve();
						return {
							returning: async () => {
								if (launchClaimed) return [];
								launchClaimed = true;
								return [{ id: "00000000-0000-0000-0000-000000000001" }];
							},
						};
					},
				};
			},
		};
	}

	const db = {
		update: makeUpdate,
		transaction: async (
			fn: (tx: {
				execute: () => Promise<Array<{ address: string; encrypted_pk: string }>>;
				update: typeof makeUpdate;
			}) => Promise<unknown>,
		) =>
			fn({
				execute: async () => (options.walletRow ? [options.walletRow] : []),
				update: makeUpdate,
			}),
	} as unknown as Database;

	return { db, updates };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	delete process.env.BUNDLE_BOT_PK;
});

describe("bundle-bot submitter safety", () => {
	it("claims a launch atomically before dry-run submission so duplicate workers cannot submit it twice", async () => {
		const { db, updates } = makeDb();
		const launch = launchFixture();

		const first = await submitLaunchBundle(db, launch, { dryRun: true, useWalletPool: false });
		const second = await submitLaunchBundle(db, launch, { dryRun: true, useWalletPool: false });

		assert.equal(first.status, "submitted");
		assert.equal(second.status, "pending");
		assert.equal(second.reason, "bundle_submission_already_claimed");
		assert.equal(updates.filter((update) => update.bundleStatus === "submitting").length, 2);
		assert.equal(updates.filter((update) => update.bundleStatus === "submitted").length, 1);
	});

	it("refuses live BUNDLE_BOT_PK fallback before any launch claim or signing", async () => {
		const { db, updates } = makeDb();
		process.env.BUNDLE_BOT_PK = TEST_PK;

		await assert.rejects(
			() => submitLaunchBundle(db, launchFixture(), { dryRun: false, useWalletPool: true }),
			(error: unknown) => error instanceof BundleSubmitterError && error.code === "PLAINTEXT_BUNDLE_BOT_PK_DISABLED",
		);
		assert.equal(updates.length, 0);
	});

	it("refuses plaintext wallet-pool keys for live submissions and never calls private RPC", async () => {
		const { db, updates } = makeDb({ walletRow: { address: TEST_WALLET, encrypted_pk: TEST_PK } });
		let fetchCalled = false;
		globalThis.fetch = (async () => {
			fetchCalled = true;
			throw new Error("fetch should not be called");
		}) as typeof fetch;

		const result = await submitLaunchBundle(db, launchFixture(), {
			dryRun: false,
			useWalletPool: true,
			rpcUrl: "http://rpc.example",
			privateRpcUrl: "http://puissant.example",
		});

		assert.equal(result.status, "failed_retry");
		assert.match(result.reason ?? "", /plaintext bundle wallet keys are disabled/u);
		assert.equal(fetchCalled, false);
		assert.ok(updates.some((update) => update.bundleStatus === "submitting"));
		assert.ok(updates.some((update) => update.bundleStatus === "failed_retry"));
	});

	it("uses configured maxAttempts when deciding whether submit failures are terminal", async () => {
		const retryDb = makeDb({ walletRow: { address: TEST_WALLET, encrypted_pk: TEST_PK } });

		const retryResult = await submitLaunchBundle(
			retryDb.db,
			launchFixture({ id: "00000000-0000-0000-0000-000000000002", bundleAttempt: 2 }),
			{
				dryRun: false,
				useWalletPool: true,
				rpcUrl: "http://rpc.example",
				privateRpcUrl: "http://puissant.example",
				maxAttempts: 5,
			},
		);

		assert.equal(retryResult.status, "failed_retry");
		assert.ok(retryDb.updates.some((update) => update.bundleStatus === "failed_retry" && update.bundleAttempt === 3));

		const terminalDb = makeDb({ walletRow: { address: TEST_WALLET, encrypted_pk: TEST_PK } });

		const terminalResult = await submitLaunchBundle(
			terminalDb.db,
			launchFixture({ id: "00000000-0000-0000-0000-000000000003", bundleAttempt: 4 }),
			{
				dryRun: false,
				useWalletPool: true,
				rpcUrl: "http://rpc.example",
				privateRpcUrl: "http://puissant.example",
				maxAttempts: 5,
			},
		);

		assert.equal(terminalResult.status, "failed_terminal");
		assert.ok(
			terminalDb.updates.some((update) => update.bundleStatus === "failed_terminal" && update.bundleAttempt === 5),
		);
	});

	it("uses configured maxAttempts when terminalizing reverted receipts", async () => {
		const { db, updates } = makeDb();

		const retryStatus = await markBundleReceipt(
			db,
			launchFixture({ bundleAttempt: 3 }),
			{ status: "reverted" },
			{
				maxAttempts: 5,
			},
		);
		const terminalStatus = await markBundleReceipt(
			db,
			launchFixture({ bundleAttempt: 5 }),
			{ status: "reverted" },
			{ maxAttempts: 5 },
		);

		assert.equal(retryStatus, "failed_retry");
		assert.equal(terminalStatus, "failed_terminal");
		assert.ok(updates.some((update) => update.bundleStatus === "failed_retry"));
		assert.ok(updates.some((update) => update.bundleStatus === "failed_terminal"));
	});

	it("rejects plaintext private key envelopes unless explicitly allowed for non-live tooling", () => {
		assert.throws(() => decryptBundleWalletPk(TEST_PK), /plaintext bundle wallet keys are disabled/u);
		assert.equal(decryptBundleWalletPk(TEST_PK, { allowPlaintext: true }), TEST_PK);
	});

	it("builds BundleExecParams with raw vanity salt", () => {
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
});
