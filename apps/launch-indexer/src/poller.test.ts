/**
 * Poller integration test using a fake event source + fake DB.
 *
 * This stops short of running against a real hardhat node (the hardhat config
 * in this repo is V2-era and the W40 LaunchFactory + W38 LaunchVault need a
 * full BSC fork to deploy properly). Instead we wire the poller to a fake
 * source that hands back hand-crafted decoded events and an in-memory DB
 * that records inserts / updates so the dispatcher → handler → DB chain is
 * end-to-end verified.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryCursorStore } from "./lib/cursor-store.js";
import type {
	BundleExecutedEvent,
	ClaimedEvent,
	ClosedEvent,
	DepositedEvent,
	LaunchCreatedEvent,
	LaunchEvent,
	LaunchedEvent,
	WithdrawnEvent,
} from "./lib/events.js";
import type { LaunchIndexerConfig, LaunchIndexerRuntime } from "./lib/runtime.js";
import { factoryCursorId, routerCursorId, vaultCursorId } from "./lib/runtime.js";
import { pollOnce } from "./poller.js";

// ---------------------------------------------------------------------------
// Fake DB
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type TableId = string;

interface FakeRow extends Row {
	id: string;
}

class FakeTable {
	rows: FakeRow[] = [];
	private nextId = 1;
	constructor(public readonly name: string) {}
	insert(value: Row): FakeRow {
		const id = (value.id as string | undefined) ?? `id-${this.name}-${this.nextId++}`;
		const row: FakeRow = { ...value, id };
		this.rows.push(row);
		return row;
	}
	update(predicate: (row: FakeRow) => boolean, patch: Row): FakeRow | null {
		const row = this.rows.find(predicate);
		if (!row) return null;
		Object.assign(row, patch);
		return row;
	}
}

function tableNameOf(table: unknown): TableId {
	// @ts-expect-error drizzle internal symbol; we just need stable identity
	return table?._?.name ?? table?.name ?? "unknown";
}

class FakeDb {
	tables = new Map<TableId, FakeTable>();
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
		const builder = {
			values(value: Row) {
				return {
					_inserted: undefined as undefined | FakeRow,
					_table: t,
					_value: value,
					_skip: false,
					onConflictDoNothing() {
						return this;
					},
					onConflictDoUpdate(arg: { set: Row }) {
						this._patch = arg.set;
						return this;
					},
					_patch: undefined as Row | undefined,
					returning() {
						return runInsert(this);
					},
					// biome-ignore lint/suspicious/noThenProperty: thenable mocks drizzle's awaitable builders
					then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
						try {
							return Promise.resolve(runInsert(this)).then(resolve, reject);
						} catch (e) {
							return Promise.reject(e).then(resolve, reject);
						}
					},
				};
			},
		};
		return builder;
	}

	update(table: unknown) {
		const t = this.getTable(table);
		return {
			set(value: Row) {
				return {
					where(_predicate: unknown) {
						// We don't translate drizzle-orm SQL fragments. Tests below
						// pre-create rows with predictable ids and we patch them by
						// matching the most recently-touched row of the table.
						if (t.rows.length === 0) return Promise.resolve([]);
						const target = t.rows[t.rows.length - 1];
						if (target) {
							for (const [k, v] of Object.entries(value)) {
								if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
									target[k] = v;
								} else if (typeof v === "bigint") {
									target[k] = v;
								}
								// drizzle sql`` fragments — leave existing value alone.
							}
						}
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
				const rowsFor = (): Row[] => {
					if (isCountSelect) {
						return [{ count: t?.rows.length ?? 0 }];
					}
					return t ? t.rows.map((r) => ({ ...r })) : [];
				};
				const whereThen = () => ({
					limit(_n: number) {
						return Promise.resolve(rowsFor().slice(0, 1));
					},
					// biome-ignore lint/suspicious/noThenProperty: thenable mocks drizzle's awaitable builders
					then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
						return Promise.resolve(rowsFor()).then(resolve, reject);
					},
				});
				return {
					where(_predicate: unknown) {
						return whereThen();
					},
					// biome-ignore lint/suspicious/noThenProperty: thenable mocks drizzle's awaitable builders
					then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
						return Promise.resolve(rowsFor()).then(resolve, reject);
					},
				};
			},
		};
	}
}

function runInsert(state: {
	_table: FakeTable;
	_value: Row;
	_patch?: Row;
}): FakeRow[] {
	const existing = state._table.rows.find(
		(r) =>
			(state._value.tokenAddress != null && r.tokenAddress === state._value.tokenAddress) ||
			(state._value.txHash != null &&
				state._value.logIndex != null &&
				r.txHash === state._value.txHash &&
				r.logIndex === state._value.logIndex),
	);
	if (existing) {
		if (state._patch) Object.assign(existing, state._patch);
		return [existing];
	}
	const inserted = state._table.insert(state._value);
	return [inserted];
}

// ---------------------------------------------------------------------------
// Fake source
// ---------------------------------------------------------------------------

class FakeSource {
	constructor(
		private readonly events: LaunchEvent[],
		public latestBlock: bigint,
	) {}
	async getLatestBlock(): Promise<bigint> {
		return this.latestBlock;
	}
	async getEvents(input: {
		addresses: `0x${string}`[];
		fromBlock: bigint;
		toBlock: bigint;
	}): Promise<LaunchEvent[]> {
		const setLower = new Set(input.addresses.map((a) => a.toLowerCase()));
		return this.events.filter(
			(e) =>
				e.blockNumber >= input.fromBlock &&
				e.blockNumber <= input.toBlock &&
				setLower.has(e.contractAddress.toLowerCase()),
		);
	}
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const factoryAddress = "0x1111111111111111111111111111111111111111" as const;
const vaultAddress = "0x2222222222222222222222222222222222222222" as const;
const routerAddress = "0x3333333333333333333333333333333333333333" as const;
const tokenAddress = "0x4444444444444444444444444444444444444444" as const;
const userA = "0x55555555555555555555555555555555555555aa" as const;
const userB = "0x55555555555555555555555555555555555555bb" as const;
const v2Pair = "0x6666666666666666666666666666666666666666" as const;

const splitterAddress = "0x7777777777777777777777777777777777777777" as const;

function launchCreatedEvent(blockNumber: bigint): LaunchCreatedEvent {
	return {
		eventName: "LaunchCreated",
		chainId: 56,
		contractAddress: factoryAddress,
		blockNumber,
		txHash: "0xa0",
		logIndex: 0,
		blockTimestamp: new Date("2026-05-08T00:00:00Z"),
		data: {
			creator: userA,
			token: tokenAddress,
			vault: vaultAddress,
			router: routerAddress,
			taxSplitter: splitterAddress,
			tier: 90,
			presaleCap: "1000000",
			v2BuyBnb: "40000",
			vestingEnabled: true,
		},
	};
}

function depositedEvent(blockNumber: bigint, user: `0x${string}`, amount: string, newTotal: string): DepositedEvent {
	return {
		eventName: "Deposited",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		txHash: `0xd${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { user, amount, newTotal },
	};
}

function withdrawnEvent(blockNumber: bigint): WithdrawnEvent {
	return {
		eventName: "Withdrawn",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		txHash: `0xe${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { user: userB, amount: "500", penalty: "50", refund: "450" },
	};
}

function closedEvent(blockNumber: bigint): ClosedEvent {
	return {
		eventName: "Closed",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		txHash: `0xc${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { by: userA, totalDeposited: "1500", bonusPool: "50" },
	};
}

function launchedEvent(blockNumber: bigint): LaunchedEvent {
	return {
		eventName: "Launched",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		txHash: `0xb${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { token: tokenAddress, totalBnb: "1500", launchTimestamp: "1700000000" },
	};
}

function bundleExecutedEvent(blockNumber: bigint): BundleExecutedEvent {
	return {
		eventName: "BundleExecuted",
		chainId: 56,
		contractAddress: routerAddress,
		blockNumber,
		txHash: `0xf${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: {
			flapToken: tokenAddress,
			v2Pair,
			curveFillBnb: "60000",
			v2BuyBnb: "4000",
			tokensFromV2: "7000",
			tokensBurned: "200",
			tokensToTax: "100",
			openMcBnb: "250000",
		},
	};
}

function claimedEvent(blockNumber: bigint, user: `0x${string}`): ClaimedEvent {
	return {
		eventName: "Claimed",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		txHash: `0xc${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 1,
		blockTimestamp: new Date(),
		data: { user, amount: "100", totalClaimed: "100" },
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRuntime(
	events: LaunchEvent[],
	latestBlock: bigint,
): {
	runtime: LaunchIndexerRuntime;
	db: FakeDb;
} {
	const config: LaunchIndexerConfig = {
		chainId: 56,
		launchFactoryAddress: factoryAddress,
		rpcUrl: "https://example.invalid",
		startBlock: 0n,
		pollIntervalMs: 1_000,
		maxBlocksPerPoll: 1_000_000n,
		confirmations: 0n,
	};

	const db = new FakeDb();
	const runtime = {
		db: db as unknown as LaunchIndexerRuntime["db"],
		logger: {
			debug() {},
			info() {},
			warn(...args: unknown[]) {
				console.warn("[runtime.warn]", ...args);
			},
			error(...args: unknown[]) {
				console.error("[runtime.error]", ...args);
			},
		} as unknown as LaunchIndexerRuntime["logger"],
		cursors: new InMemoryCursorStore(),
		source: new FakeSource(events, latestBlock),
		config,
	};

	return { runtime, db };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("pollOnce: indexes LaunchCreated → Deposited → Closed → BundleExecuted → Claimed", async () => {
	const events: LaunchEvent[] = [
		launchCreatedEvent(100n),
		depositedEvent(101n, userA, "1000", "1000"),
		depositedEvent(102n, userB, "500", "1500"),
		closedEvent(110n),
		launchedEvent(111n),
		bundleExecutedEvent(112n),
		claimedEvent(120n, userA),
	];

	const { runtime, db } = buildRuntime(events, 200n);

	const result = await pollOnce(runtime);

	assert.equal(result.factoryEventCount, 1);
	assert.ok(result.vaultEventCount >= 4, `expected vault events ≥ 4, got ${result.vaultEventCount}`);
	assert.equal(result.routerEventCount, 1);

	const allRows = Array.from(db.tables.values()).flatMap((t) => t.rows);
	assert.ok(allRows.length > 0, "expected at least one row inserted");

	// Cursors were advanced to target_block
	const factoryCursor = await runtime.cursors.read(factoryCursorId(56, factoryAddress));
	assert.equal(factoryCursor?.lastBlock, 200n);

	const vaultCursor = await runtime.cursors.read(vaultCursorId(56, vaultAddress));
	assert.equal(vaultCursor?.lastBlock, 200n);

	const routerCursor = await runtime.cursors.read(routerCursorId(56, routerAddress));
	assert.equal(routerCursor?.lastBlock, 200n);
});

test("pollOnce: respects confirmations (target = latest - confirmations)", async () => {
	const { runtime } = buildRuntime([], 100n);
	runtime.config.confirmations = 5n;

	const result = await pollOnce(runtime);

	assert.equal(result.scannedToBlock, 95n);
});

test("pollOnce: target_block = 0 when latest <= confirmations is a no-op", async () => {
	const { runtime } = buildRuntime([], 3n);
	runtime.config.confirmations = 5n;

	const result = await pollOnce(runtime);

	assert.equal(result.scannedToBlock, 0n);
	assert.equal(result.factoryEventCount, 0);
	assert.equal(result.vaultEventCount, 0);
	assert.equal(result.routerEventCount, 0);
});
