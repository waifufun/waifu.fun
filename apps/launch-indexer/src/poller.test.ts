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

import { schema } from "@waifufun/db";
import { getTableName, is, Table } from "drizzle-orm";
import { InMemoryCursorStore } from "./lib/cursor-store.js";
import type {
	BundleExecutedEvent,
	BundleFailedEvent,
	BuybackExecutedEvent,
	ClaimedEvent,
	ClosedEvent,
	DepositedEvent,
	DistributedEvent,
	FlapLaunchedToDexEvent,
	LaunchCreatedEvent,
	LaunchEvent,
	LaunchExecutedEvent,
	PortalTokenCreatedEvent,
	RefundEnabledEvent,
	WithdrawnEvent,
} from "./lib/events.js";
import type { LaunchIndexerConfig, LaunchIndexerRuntime } from "./lib/runtime.js";
import {
	factoryCursorId,
	flapCursorId,
	portalCursorId,
	routerCursorId,
	treasuryLpCursorId,
	vaultCursorId,
} from "./lib/runtime.js";
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
	if (is(table, Table)) return getTableName(table);
	return "unknown";
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
const treasuryReserveAddress = "0x7777777777777777777777777777777777777777" as const;
const taxSplitterAddress = "0x8888888888888888888888888888888888888888" as const;
const agentSafeAddress = "0x9999999999999999999999999999999999999999" as const;
const defaultPortalAddress = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0" as const;
const flapFactoryAddress = "0x8888888888888888888888888888888888888888" as const;

function launchCreatedEvent(blockNumber: bigint): LaunchCreatedEvent {
	return {
		eventName: "LaunchCreated",
		chainId: 56,
		contractAddress: factoryAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: "0xa0",
		logIndex: 0,
		blockTimestamp: new Date("2026-05-08T00:00:00Z"),
		data: {
			launchId: "0xaaaa" as `0x${string}`,
			creator: userA,
			predictedToken: tokenAddress,
			vault: vaultAddress,
			router: routerAddress,
			treasuryLp: treasuryReserveAddress,
			taxSplitter: taxSplitterAddress,
			agentSafe: agentSafeAddress,
			tier: 90,
			presaleCap: "1000000",
			v2BuyBnb: "40000",
			closeTimestamp: "1700000000",
		},
	};
}

function depositedEvent(blockNumber: bigint, user: `0x${string}`, amount: string, newTotal: string): DepositedEvent {
	return {
		eventName: "Deposited",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
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
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
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
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0xc${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { by: userA, totalDeposited: "1500", bonusPool: "50" },
	};
}

function launchExecutedEvent(blockNumber: bigint): LaunchExecutedEvent {
	return {
		eventName: "LaunchExecuted",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0xb${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { token: tokenAddress, totalBnb: "1500", timestamp: "1700000000" },
	};
}

function distributedEvent(blockNumber: bigint): DistributedEvent {
	return {
		eventName: "Distributed",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0xdd${blockNumber.toString(16).padStart(62, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { token: tokenAddress, presalerShare: "40000000000000000000000" },
	};
}

function refundEnabledEvent(blockNumber: bigint, reason: string): RefundEnabledEvent {
	return {
		eventName: "RefundEnabled",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0xre${blockNumber.toString(16).padStart(62, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { by: userA, reason },
	};
}

function bundleExecutedEvent(blockNumber: bigint): BundleExecutedEvent {
	return {
		eventName: "BundleExecuted",
		chainId: 56,
		contractAddress: routerAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0xf${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: {
			token: tokenAddress,
			pool: v2Pair,
			quoteAmt: "60000",
			v2BuyBnb: "4000",
			tokensReceived: "7000",
			tokensBurned: "200",
			tokensToTreasury: "100",
			tokensToVault: "100",
			tipPaid: "50",
			openMcBnb: "250000",
		},
	};
}

function bundleFailedEvent(blockNumber: bigint, reason: string): BundleFailedEvent {
	return {
		eventName: "BundleFailed",
		chainId: 56,
		contractAddress: routerAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0xbf${blockNumber.toString(16).padStart(62, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { reason },
	};
}

function claimedEvent(blockNumber: bigint, user: `0x${string}`): ClaimedEvent {
	return {
		eventName: "Claimed",
		chainId: 56,
		contractAddress: vaultAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0xc${blockNumber.toString(16).padStart(63, "0")}` as `0x${string}`,
		logIndex: 1,
		blockTimestamp: new Date(),
		data: { user, amount: "100", totalClaimed: "100" },
	};
}

function portalTokenCreatedEvent(
	blockNumber: bigint,
	token = tokenAddress,
	ts = "1715551200",
): PortalTokenCreatedEvent {
	return {
		eventName: "TokenCreated",
		chainId: 56,
		contractAddress: defaultPortalAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0x70${blockNumber.toString(16).padStart(62, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: {
			ts,
			creator: userA,
			nonce: "42",
			token,
			name: "Test Token",
			symbol: "TT",
			meta: "ipfs://meta",
		},
	};
}

function flapLaunchedToDexEvent(blockNumber: bigint, pair: unknown = v2Pair): FlapLaunchedToDexEvent {
	return {
		eventName: "LaunchedToDEX",
		chainId: 56,
		contractAddress: flapFactoryAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0x71${blockNumber.toString(16).padStart(62, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { token: tokenAddress, pair: pair as `0x${string}`, quoteAmt: "5000000000000000000" },
	};
}

function buybackExecutedEvent(blockNumber: bigint): BuybackExecutedEvent {
	return {
		eventName: "BuybackExecuted",
		chainId: 56,
		contractAddress: treasuryReserveAddress,
		blockNumber,
		blockHash: "0x00000000000000000000000000000000000000000000000000000000000000b1",
		txHash: `0xbb${blockNumber.toString(16).padStart(62, "0")}` as `0x${string}`,
		logIndex: 0,
		blockTimestamp: new Date(),
		data: { bnbSpent: "1000", tokensBurned: "2000" },
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRuntime(
	events: LaunchEvent[],
	latestBlock: bigint,
	configOverrides: Partial<LaunchIndexerConfig> = {},
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
		...configOverrides,
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
		launchExecutedEvent(111n),
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

test("pollOnce: indexes a TreasuryLP event for a newly-created launch (gap F16)", async () => {
	const events: LaunchEvent[] = [launchCreatedEvent(100n), buybackExecutedEvent(105n)];
	const { runtime, db } = buildRuntime(events, 200n);

	const result = await pollOnce(runtime);

	assert.equal(result.treasuryLpEventCount, 1);

	const treasuryRows = db.tables.get("treasury_lp_events")?.rows ?? [];
	assert.equal(treasuryRows.length, 1);
	assert.equal(treasuryRows[0]?.eventKind, "BuybackExecuted");
	assert.equal(treasuryRows[0]?.treasuryLpAddress, treasuryReserveAddress.toLowerCase());

	const tCursor = await runtime.cursors.read(treasuryLpCursorId(56, treasuryReserveAddress));
	assert.equal(tCursor?.lastBlock, 200n);
});

test("pollOnce: backfills TreasuryLP events for a pre-existing launch with no cursor (gap F16)", async () => {
	// Simulate a launch the indexer already processed BEFORE treasury indexing
	// existed: its row is in the DB, but there is no LaunchCreated event this
	// tick (so Phase 1 never bootstraps a treasury cursor) and no cursor yet.
	// Phase 3 must `ensure` the cursor seeded at createBlockNumber-1 and backfill.
	const events: LaunchEvent[] = [buybackExecutedEvent(105n)];
	const { runtime, db } = buildRuntime(events, 200n);

	db.getTable(schema.agentLaunches).insert({
		id: "pre-existing-launch",
		vaultAddress: vaultAddress.toLowerCase(),
		routerAddress: routerAddress.toLowerCase(),
		treasuryLpAddress: treasuryReserveAddress.toLowerCase(),
		createBlockNumber: 100n,
	});

	// No treasury cursor exists yet.
	assert.equal(await runtime.cursors.read(treasuryLpCursorId(56, treasuryReserveAddress)), null);

	const result = await pollOnce(runtime);

	assert.equal(result.treasuryLpEventCount, 1, "pre-existing launch should backfill its treasury event");
	const treasuryRows = db.tables.get("treasury_lp_events")?.rows ?? [];
	assert.equal(treasuryRows.length, 1);
	assert.equal(treasuryRows[0]?.launchId, "pre-existing-launch");

	const tCursor = await runtime.cursors.read(treasuryLpCursorId(56, treasuryReserveAddress));
	assert.equal(tCursor?.lastBlock, 200n);
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

test("pollOnce: does not advance factory cursor after LaunchCreated handler failure", async () => {
	const badLaunchCreated = launchCreatedEvent(100n);
	badLaunchCreated.data.closeTimestamp = "not-a-timestamp";
	const { runtime } = buildRuntime([badLaunchCreated], 200n);

	const result = await pollOnce(runtime);

	assert.equal(result.factoryEventCount, 0);
	const factoryCursor = await runtime.cursors.read(factoryCursorId(56, factoryAddress));
	assert.equal(factoryCursor?.lastBlock, 0n);
});

test("pollOnce: does not advance portal cursor after TokenCreated handler failure", async () => {
	const { runtime, db } = buildRuntime([portalTokenCreatedEvent(100n, tokenAddress, "not-a-timestamp")], 200n);
	db.getTable(schema.agentLaunches).insert({
		id: "launch-portal-failure",
		predictedTokenAddress: tokenAddress,
		vaultAddress,
		routerAddress,
	});

	const result = await pollOnce(runtime);

	assert.equal(result.portalEventCount, 0);
	const portalCursor = await runtime.cursors.read(portalCursorId(56, defaultPortalAddress));
	assert.equal(portalCursor?.lastBlock, 0n);
});

test("pollOnce: does not advance flap cursor after LaunchedToDEX handler failure", async () => {
	const { runtime, db } = buildRuntime([flapLaunchedToDexEvent(100n, null)], 200n, {
		flapTokenFactoryAddress: flapFactoryAddress,
	});
	db.getTable(schema.agentLaunches).insert({
		id: "launch-flap-failure",
		flapTokenAddress: tokenAddress,
		vaultAddress,
		routerAddress,
	});

	const result = await pollOnce(runtime);

	assert.equal(result.flapEventCount, 0);
	const flapCursor = await runtime.cursors.read(flapCursorId(56, flapFactoryAddress));
	assert.equal(flapCursor?.lastBlock, 0n);
});
