import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClaimedEvent, DepositedEvent, RefundedEvent, WithdrawnEvent } from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";
import { handleClaimed, handleDeposited, handleRefunded, handleWithdrawn } from "./vault.js";

type Row = Record<string, unknown>;

interface InsertState {
	table: FakeTable;
	value: Row;
}

class FakeTable {
	public rows: Row[] = [];
	public updateCount = 0;

	insert(value: Row): Row[] {
		const existing = this.rows.find(
			(row) => row.txHash === value.txHash && row.logIndex === value.logIndex,
		);
		if (existing) {
			return [];
		}

		const row = { ...value, id: `row-${this.rows.length + 1}` };
		this.rows.push(row);
		return [row];
	}
}

class FakeDb {
	public tables = new Map<string, FakeTable>();

	private getTable(table: unknown): FakeTable {
		const name = tableNameOf(table);
		let fakeTable = this.tables.get(name);
		if (!fakeTable) {
			fakeTable = new FakeTable();
			this.tables.set(name, fakeTable);
		}
		return fakeTable;
	}

	insert(table: unknown) {
		const fakeTable = this.getTable(table);
		return {
			values(value: Row) {
				const state: InsertState = { table: fakeTable, value };
				return {
					onConflictDoNothing() {
						return this;
					},
					returning() {
						return Promise.resolve(runInsert(state));
					},
					// biome-ignore lint/suspicious/noThenProperty: thenable mocks drizzle's awaitable builders
					then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
						return Promise.resolve(runInsert(state)).then(resolve, reject);
					},
				};
			},
		};
	}

	update(table: unknown) {
		const fakeTable = this.getTable(table);
		return {
			set(value: Row) {
				return {
					where(_predicate: unknown) {
						fakeTable.updateCount += 1;
						const latest = fakeTable.rows.at(-1);
						if (latest) {
							for (const [key, nextValue] of Object.entries(value)) {
								if (
									typeof nextValue === "string" ||
									typeof nextValue === "number" ||
									typeof nextValue === "boolean" ||
									typeof nextValue === "bigint" ||
									nextValue === null
								) {
									latest[key] = nextValue;
								}
							}
						}
						return Promise.resolve([]);
					},
				};
			},
		};
	}

	select(_cols?: Record<string, unknown>) {
		const tables = this.tables;
		return {
			from(table: unknown) {
				const fakeTable = tables.get(tableNameOf(table));
				const rows = fakeTable?.rows ?? [];
				return {
					where(_predicate: unknown) {
						return Promise.resolve([{ count: rows.length }]);
					},
				};
			},
		};
	}
}

function runInsert(state: InsertState): Row[] {
	return state.table.insert(state.value);
}

function tableNameOf(table: unknown): string {
	return (
		(table as { _?: { name?: string }; name?: string })?._?.name ??
		(table as { name?: string })?.name ??
		"unknown"
	);
}

function makeRuntime(): { runtime: LaunchIndexerRuntime; db: FakeDb } {
	const db = new FakeDb();
	const logger = {
		debug() {},
		info() {},
		warn() {},
		error() {},
		child() {
			return logger;
		},
	};

	return {
		db,
		runtime: {
			db: db as unknown as LaunchIndexerRuntime["db"],
			logger: logger as unknown as LaunchIndexerRuntime["logger"],
			cursors: undefined as unknown as LaunchIndexerRuntime["cursors"],
			source: undefined as unknown as LaunchIndexerRuntime["source"],
			config: {} as LaunchIndexerRuntime["config"],
		},
	};
}

const launchId = "launch-1";
const user = "0x55555555555555555555555555555555555555aa" as const;
const txHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const blockHashA = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const blockHashB = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;

function withBlockHash<T extends { blockHash: `0x${string}` }>(event: T, blockHash: `0x${string}`): T {
	return { ...event, blockHash };
}

function depositedEvent(): DepositedEvent {
	return {
		eventName: "Deposited",
		chainId: 56,
		contractAddress: "0x2222222222222222222222222222222222222222",
		blockNumber: 100n,
		blockHash: blockHashA,
		txHash,
		logIndex: 7,
		blockTimestamp: new Date("2026-05-29T00:00:00Z"),
		data: { user, amount: "1000", newTotal: "1000" },
	};
}

function withdrawnEvent(): WithdrawnEvent {
	return {
		eventName: "Withdrawn",
		chainId: 56,
		contractAddress: "0x2222222222222222222222222222222222222222",
		blockNumber: 101n,
		blockHash: blockHashA,
		txHash,
		logIndex: 8,
		blockTimestamp: new Date("2026-05-29T00:00:00Z"),
		data: { user, amount: "400", penalty: "40", refund: "360" },
	};
}

function refundedEvent(): RefundedEvent {
	return {
		eventName: "Refunded",
		chainId: 56,
		contractAddress: "0x2222222222222222222222222222222222222222",
		blockNumber: 102n,
		blockHash: blockHashA,
		txHash,
		logIndex: 9,
		blockTimestamp: new Date("2026-05-29T00:00:00Z"),
		data: { user, principal: "400", bonus: "20", refundAmount: "420" },
	};
}

function claimedEvent(): ClaimedEvent {
	return {
		eventName: "Claimed",
		chainId: 56,
		contractAddress: "0x2222222222222222222222222222222222222222",
		blockNumber: 103n,
		blockHash: blockHashA,
		txHash,
		logIndex: 10,
		blockTimestamp: new Date("2026-05-29T00:00:00Z"),
		data: { user, amount: "100", totalClaimed: "100" },
	};
}

test("handleDeposited: reorg block hash variant does not apply aggregate updates twice", async () => {
	const { runtime, db } = makeRuntime();
	const first = depositedEvent();

	await handleDeposited(runtime, first, { launchId });
	const updateCountAfterFirst = db.tables.get("agent_launches")?.updateCount;
	await handleDeposited(runtime, withBlockHash(first, blockHashB), { launchId });

	assert.equal(db.tables.get("launch_deposits")?.rows.length, 1);
	assert.equal(db.tables.get("launch_deposits")?.rows[0]?.blockHash, blockHashA);
	assert.equal(db.tables.get("agent_launches")?.updateCount, updateCountAfterFirst);
});

test("handleWithdrawn: reorg block hash variant does not apply aggregate updates twice", async () => {
	const { runtime, db } = makeRuntime();
	const first = withdrawnEvent();

	await handleWithdrawn(runtime, first, { launchId });
	const updateCountAfterFirst = db.tables.get("agent_launches")?.updateCount;
	await handleWithdrawn(runtime, withBlockHash(first, blockHashB), { launchId });

	assert.equal(db.tables.get("launch_withdrawals")?.rows.length, 1);
	assert.equal(db.tables.get("launch_withdrawals")?.rows[0]?.blockHash, blockHashA);
	assert.equal(db.tables.get("agent_launches")?.updateCount, updateCountAfterFirst);
});

test("handleRefunded: reorg block hash variant does not apply aggregate updates twice", async () => {
	const { runtime, db } = makeRuntime();
	const first = refundedEvent();

	await handleRefunded(runtime, first, { launchId });
	const updateCountAfterFirst = db.tables.get("agent_launches")?.updateCount;
	await handleRefunded(runtime, withBlockHash(first, blockHashB), { launchId });

	assert.equal(db.tables.get("launch_withdrawals")?.rows.length, 1);
	assert.equal(db.tables.get("launch_withdrawals")?.rows[0]?.blockHash, blockHashA);
	assert.equal(db.tables.get("agent_launches")?.updateCount, updateCountAfterFirst);
});

test("handleClaimed: reorg block hash variant keeps one canonical claim row", async () => {
	const { runtime, db } = makeRuntime();
	const first = claimedEvent();

	await handleClaimed(runtime, first, { launchId });
	await handleClaimed(runtime, withBlockHash(first, blockHashB), { launchId });

	assert.equal(db.tables.get("launch_claims")?.rows.length, 1);
	assert.equal(db.tables.get("launch_claims")?.rows[0]?.blockHash, blockHashA);
});
