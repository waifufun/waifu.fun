/**
 * Handler-level regression tests for launch event replays that keep the same
 * tx_hash/log_index but land under a different block_hash.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { schema } from "@waifufun/db";
import { Table, getTableName, is } from "drizzle-orm";

import type { ClaimedEvent, DepositedEvent, RefundedEvent, WithdrawnEvent } from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";
import { handleClaimed, handleDeposited, handleRefunded, handleWithdrawn } from "./vault.js";

type Row = Record<string, unknown>;

interface UpdateRecord {
	table: string;
	patch: Row;
}

class FakeTable {
	rows: Row[] = [];
	private nextId = 1;

	constructor(public readonly name: string) {}

	insert(value: Row): Row {
		const row = { ...value, id: value.id ?? `id-${this.name}-${this.nextId++}` };
		this.rows.push(row);
		return row;
	}
}

function tableNameOf(table: unknown): string {
	if (is(table, Table)) return getTableName(table);
	return "unknown";
}

class FakeDb {
	tables = new Map<string, FakeTable>();
	updates: UpdateRecord[] = [];

	getTable(table: unknown): FakeTable {
		const name = tableNameOf(table);
		let t = this.tables.get(name);
		if (!t) {
			t = new FakeTable(name);
			this.tables.set(name, t);
		}
		return t;
	}

	insert(table: unknown) {
		const t = this.getTable(table);
		return {
			values(value: Row) {
				const runInsert = () => {
					const existing = t.rows.find(
						(row) =>
							row.txHash === value.txHash && row.logIndex === value.logIndex && row.blockHash === value.blockHash,
					);
					if (existing) return [];
					return [t.insert(value)];
				};
				return {
					onConflictDoNothing() {
						const builder = {
							returning() {
								return Promise.resolve(runInsert());
							},
							// biome-ignore lint/suspicious/noThenProperty: thenable mocks drizzle's awaitable builders
							then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
								return Promise.resolve(runInsert()).then(resolve, reject);
							},
						};
						return builder;
					},
				};
			},
		};
	}

	update(table: unknown) {
		const tableName = tableNameOf(table);
		const updates = this.updates;
		return {
			set(value: Row) {
				return {
					where(_predicate: unknown) {
						updates.push({ table: tableName, patch: value });
						return Promise.resolve([]);
					},
				};
			},
		};
	}

	select(cols?: Record<string, unknown>) {
		const tables = this.tables;
		const isCountSelect = cols != null && Object.keys(cols).length === 1 && Object.keys(cols)[0] === "count";
		return {
			from(table: unknown) {
				const t = tables.get(tableNameOf(table));
				const rows = () => (isCountSelect ? [{ count: t?.rows.length ?? 0 }] : (t?.rows ?? []));
				return {
					where(_predicate: unknown) {
						return Promise.resolve(rows());
					},
				};
			},
		};
	}
}

function makeRuntime(): { runtime: LaunchIndexerRuntime; db: FakeDb } {
	const db = new FakeDb();
	const noop = () => {};
	const logger = {
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
		child() {
			return logger;
		},
	};
	const runtime = {
		db: db as unknown as LaunchIndexerRuntime["db"],
		logger: logger as unknown as LaunchIndexerRuntime["logger"],
		cursors: undefined as unknown as LaunchIndexerRuntime["cursors"],
		source: undefined as unknown as LaunchIndexerRuntime["source"],
		config: {} as LaunchIndexerRuntime["config"],
	};
	return { runtime, db };
}

const LAUNCH_ID = "launch-1";
const VAULT = "0x2222222222222222222222222222222222222222";
const USER = "0x55555555555555555555555555555555555555aa";
const TX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const BLOCK_A = "0x00000000000000000000000000000000000000000000000000000000000000a1" as `0x${string}`;
const BLOCK_B = "0x00000000000000000000000000000000000000000000000000000000000000b2" as `0x${string}`;

function baseEvent(blockHash: `0x${string}`) {
	return {
		chainId: 56,
		contractAddress: VAULT as `0x${string}`,
		blockNumber: blockHash === BLOCK_A ? 100n : 101n,
		blockHash,
		txHash: TX,
		logIndex: 7,
		blockTimestamp: new Date("2026-05-31T00:00:00Z"),
	};
}

function deposited(blockHash: `0x${string}`): DepositedEvent {
	return {
		...baseEvent(blockHash),
		eventName: "Deposited",
		data: { user: USER as `0x${string}`, amount: "1000", newTotal: "1000" },
	};
}

function withdrawn(blockHash: `0x${string}`): WithdrawnEvent {
	return {
		...baseEvent(blockHash),
		eventName: "Withdrawn",
		data: { user: USER as `0x${string}`, amount: "400", penalty: "40", refund: "360" },
	};
}

function refunded(blockHash: `0x${string}`): RefundedEvent {
	return {
		...baseEvent(blockHash),
		eventName: "Refunded",
		data: { user: USER as `0x${string}`, principal: "600", bonus: "60", refundAmount: "660" },
	};
}

function claimed(blockHash: `0x${string}`): ClaimedEvent {
	return {
		...baseEvent(blockHash),
		eventName: "Claimed",
		data: { user: USER as `0x${string}`, amount: "123", totalClaimed: "123" },
	};
}

test("handleDeposited: same tx/log with a different block_hash remains visible but mutates aggregates once", async () => {
	const { runtime, db } = makeRuntime();

	await handleDeposited(runtime, deposited(BLOCK_A), { launchId: LAUNCH_ID });
	await handleDeposited(runtime, deposited(BLOCK_B), { launchId: LAUNCH_ID });

	const rows = db.getTable(schema.launchDeposits).rows;
	assert.equal(rows.length, 2, "alternate block hash replay should keep a visible event row");
	assert.deepEqual(
		rows.map((row) => row.blockHash),
		[BLOCK_A, BLOCK_B],
	);
	assert.equal(db.updates.length, 2, "only the canonical first observation updates total + depositor count");
});

test("handleWithdrawn: same tx/log with a different block_hash does not double-debit aggregate totals", async () => {
	const { runtime, db } = makeRuntime();

	await handleWithdrawn(runtime, withdrawn(BLOCK_A), { launchId: LAUNCH_ID });
	await handleWithdrawn(runtime, withdrawn(BLOCK_B), { launchId: LAUNCH_ID });

	const rows = db.getTable(schema.launchWithdrawals).rows;
	assert.equal(rows.length, 2);
	assert.equal(db.updates.length, 1, "only the canonical first observation updates totalDeposited/bonusPool");
});

test("handleRefunded: same tx/log with a different block_hash does not double-debit refund aggregates", async () => {
	const { runtime, db } = makeRuntime();

	await handleRefunded(runtime, refunded(BLOCK_A), { launchId: LAUNCH_ID });
	await handleRefunded(runtime, refunded(BLOCK_B), { launchId: LAUNCH_ID });

	const rows = db.getTable(schema.launchWithdrawals).rows;
	assert.equal(rows.length, 2);
	assert.equal(db.updates.length, 1, "only the canonical first observation updates totalDeposited/bonusPool");
});

test("handleClaimed: same tx/log with a different block_hash preserves event visibility", async () => {
	const { runtime, db } = makeRuntime();

	await handleClaimed(runtime, claimed(BLOCK_A), { launchId: LAUNCH_ID });
	await handleClaimed(runtime, claimed(BLOCK_B), { launchId: LAUNCH_ID });

	const rows = db.getTable(schema.launchClaims).rows;
	assert.equal(rows.length, 2);
	assert.deepEqual(
		rows.map((row) => row.blockHash),
		[BLOCK_A, BLOCK_B],
	);
	assert.equal(db.updates.length, 0);
});
