import assert from "node:assert/strict";
import test from "node:test";

import type { BundleSubmitterDeps, InclusionWatcher, PublicMempoolFallback } from "./index.js";
import { deriveTxHash, submitBundle } from "./index.js";
import { type PuissantClient, PuissantRpcError } from "./puissant-client.js";

interface FakeRow {
	bundleHash: string;
	txHash: string | null;
	rawTx: string;
	chainId: number;
	status: string;
	path: string;
	blockNumber: string | null;
	fallbackTxHash: string | null;
	deadline: Date;
	submittedAt: Date;
	includedAt: Date | null;
	expiredAt: Date | null;
	fallbackAt: Date | null;
	lastError: string | null;
	attempts: number;
	metadata: Record<string, unknown>;
	createdAt: Date;
	updatedAt: Date;
}

function makeFakeDb() {
	const rows = new Map<string, FakeRow>();
	const fake = {
		insert(_table: unknown) {
			return {
				values(values: Partial<FakeRow>) {
					return {
						onConflictDoUpdate(_args: unknown) {
							const row: FakeRow = {
								bundleHash: values.bundleHash ?? "",
								txHash: values.txHash ?? null,
								rawTx: values.rawTx ?? "",
								chainId: values.chainId ?? 56,
								status: values.status ?? "submitted",
								path: values.path ?? "puissant",
								blockNumber: null,
								fallbackTxHash: null,
								deadline: values.deadline ?? new Date(0),
								submittedAt: values.submittedAt ?? new Date(),
								includedAt: null,
								expiredAt: null,
								fallbackAt: null,
								lastError: null,
								attempts: 1,
								metadata: values.metadata ?? {},
								createdAt: values.submittedAt ?? new Date(),
								updatedAt: values.updatedAt ?? new Date(),
							};
							const existing = rows.get(row.bundleHash);
							if (existing) {
								existing.attempts += 1;
								existing.updatedAt = row.updatedAt;
							} else {
								rows.set(row.bundleHash, row);
							}
							return Promise.resolve();
						},
					};
				},
			};
		},
		update(_table: unknown) {
			return {
				set(values: Partial<FakeRow>) {
					return {
						where(_predicate: unknown) {
							for (const row of rows.values()) {
								Object.assign(row, values);
							}
							return Promise.resolve();
						},
					};
				},
			};
		},
		_rows: rows,
	};
	return fake;
}

function makeWatcher(blockNumber: string | null): InclusionWatcher {
	return {
		async waitForInclusion() {
			return blockNumber;
		},
	};
}

function makePuissant(behavior: "ok" | "error"): PuissantClient {
	return {
		async sendPrivateRawTransaction() {
			if (behavior === "error") throw new PuissantRpcError(-32000, "rejected");
			return "0xfeedface";
		},
	};
}

function makeFallback(hash = "0xfallbackhash"): PublicMempoolFallback {
	return {
		async sendRawTransaction() {
			return hash;
		},
	};
}

function buildDeps(overrides: Partial<BundleSubmitterDeps> = {}): {
	deps: BundleSubmitterDeps;
	db: ReturnType<typeof makeFakeDb>;
} {
	const db = makeFakeDb();
	const baseTime = new Date("2026-05-08T12:00:00.000Z");
	let tick = 0;
	const deps: BundleSubmitterDeps = {
		db: db as never,
		puissant: makePuissant("ok"),
		watcher: makeWatcher("123456"),
		publicFallback: makeFallback(),
		now: () => new Date(baseTime.getTime() + tick++ * 1_000),
		maxBlocks: 5,
		pollMs: 0,
		chainId: 56,
		...overrides,
	};
	return { deps, db };
}

const SAMPLE_RAW_TX = "0xf86b80843b9aca0082520894d2135cfb216b74109775236e36d4b433f1df507b8080820cdba0bbcde";
const FUTURE_DEADLINE = Math.floor(new Date("2030-01-01").getTime() / 1000);

test("deriveTxHash hashes the raw tx with keccak256", () => {
	const hash = deriveTxHash(SAMPLE_RAW_TX);
	assert.match(hash, /^0x[0-9a-f]{64}$/);
});

test("submitBundle marks bundle as included when puissant accepts and watcher confirms", async () => {
	const { deps, db } = buildDeps();
	const result = await submitBundle(deps, {
		rawTx: SAMPLE_RAW_TX,
		deadline: FUTURE_DEADLINE,
	});

	assert.equal(result.status, "included");
	assert.equal(result.bundleHash, deriveTxHash(SAMPLE_RAW_TX));
	assert.equal(result.txHash, result.bundleHash);

	const row = db._rows.get(result.bundleHash);
	assert.ok(row);
	assert.equal(row?.status, "included");
	assert.equal(row?.blockNumber, "123456");
});

test("submitBundle falls back to public mempool when puissant misses inclusion", async () => {
	const { deps, db } = buildDeps({
		watcher: {
			waitForInclusion: (() => {
				let calls = 0;
				return async () => {
					calls++;
					return calls === 1 ? null : "987654";
				};
			})(),
		},
	});

	const result = await submitBundle(deps, {
		rawTx: SAMPLE_RAW_TX,
		deadline: FUTURE_DEADLINE,
		fallbackPublic: true,
	});

	assert.equal(result.status, "included");
	assert.equal(result.txHash, "0xfallbackhash");

	const row = db._rows.get(result.bundleHash);
	assert.ok(row);
	assert.equal(row?.status, "included");
	assert.equal(row?.fallbackTxHash, "0xfallbackhash");
	assert.equal(row?.path, "puissant+public");
});

test("submitBundle skips fallback when fallbackPublic is false", async () => {
	const { deps, db } = buildDeps({
		watcher: makeWatcher(null),
	});

	const result = await submitBundle(deps, {
		rawTx: SAMPLE_RAW_TX,
		deadline: FUTURE_DEADLINE,
		fallbackPublic: false,
	});

	assert.equal(result.status, "expired");
	const row = db._rows.get(result.bundleHash);
	assert.equal(row?.status, "expired");
	assert.equal(row?.fallbackTxHash, null);
});

test("submitBundle records puissant failure and uses public path when fallback is enabled", async () => {
	const { deps, db } = buildDeps({
		puissant: makePuissant("error"),
		watcher: makeWatcher("555"),
	});

	const result = await submitBundle(deps, {
		rawTx: SAMPLE_RAW_TX,
		deadline: FUTURE_DEADLINE,
		fallbackPublic: true,
	});

	assert.equal(result.status, "included");
	assert.equal(result.txHash, "0xfallbackhash");
	const row = db._rows.get(result.bundleHash);
	assert.equal(row?.path, "public");
	assert.match(row?.lastError ?? "", /rejected/);
});

test("submitBundle returns failed when puissant errors and no fallback configured", async () => {
	const { deps, db } = buildDeps({
		puissant: makePuissant("error"),
		watcher: makeWatcher(null),
		publicFallback: undefined,
	});

	const result = await submitBundle(deps, {
		rawTx: SAMPLE_RAW_TX,
		deadline: FUTURE_DEADLINE,
		fallbackPublic: true,
	});

	assert.equal(result.status, "failed");
	assert.equal(result.txHash, null);
	const row = db._rows.get(result.bundleHash);
	assert.equal(row?.status, "failed");
});

test("submitBundle rejects malformed rawTx", async () => {
	const { deps } = buildDeps();
	await assert.rejects(submitBundle(deps, { rawTx: "not-hex", deadline: FUTURE_DEADLINE }), /0x-prefixed hex string/);
});

test("submitBundle rejects non-positive deadline", async () => {
	const { deps } = buildDeps();
	await assert.rejects(submitBundle(deps, { rawTx: SAMPLE_RAW_TX, deadline: 0 }), /deadline must be a positive/);
});
