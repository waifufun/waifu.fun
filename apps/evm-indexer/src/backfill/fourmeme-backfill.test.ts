import assert from "node:assert/strict";
import { test } from "node:test";
import { schema } from "@waifufun/db";

import { InMemoryCursorStore } from "../lib/cursor-store.js";
import type { Erc8004RegisteredEvent, FourMemeEvent } from "../lib/fourmeme-events.js";
import type { FourMemeEventSource } from "../lib/fourmeme-source.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { runFourMemeBackfill } from "./fourmeme-backfill.js";

const tokenAddress = "0x00000000000000000000000000000000000000a1" as const;
const ownerAddress = "0x00000000000000000000000000000000000000b2" as const;
const tokenManager = "0x5c952063c7fc8610FFDB798152D69F0B9550762b" as const;
const registry = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

class InsertBuilder {
	constructor(
		private readonly db: FakeDb,
		private readonly table: unknown,
	) {}

	values(value: unknown) {
		this.db.inserts.push({ table: this.table, value });
		return this;
	}

	onConflictDoUpdate(input?: unknown) {
		this.db.conflicts.push({ table: this.table, input });
		return this;
	}
}

class SelectBuilder {
	private table: unknown;

	constructor(private readonly db: FakeDb) {}

	from(table: unknown) {
		this.table = table;
		return this;
	}

	where() {
		return this;
	}

	limit() {
		if (this.table === schema.agentWallets) {
			return Promise.resolve(
				this.db.knownWallet ? [{ id: 1, internalAgentId: "agent-test", agentToken: tokenAddress, metadata: {} }] : [],
			);
		}
		return Promise.resolve([]);
	}
}

class FakeDb {
	inserts: Array<{ table: unknown; value: unknown }> = [];
	conflicts: Array<{ table: unknown; input: unknown }> = [];

	constructor(readonly knownWallet = true) {}

	insert(table: unknown) {
		return new InsertBuilder(this, table);
	}

	select() {
		return new SelectBuilder(this);
	}
}

function registered(blockNumber: bigint, logIndex: number): Erc8004RegisteredEvent {
	return {
		eventName: "Registered",
		chainId: 56,
		contractAddress: registry,
		blockNumber,
		txHash: `0x${blockNumber.toString(16).padStart(64, "0")}`,
		logIndex,
		blockTimestamp: new Date("2026-06-02T19:00:00.000Z"),
		data: {
			agentId: "1247",
			agentURI: "ipfs://bafybeigdyrztjsol8004",
			owner: ownerAddress,
		},
	};
}

function createRuntime(db = new FakeDb()): IndexerRuntime {
	return {
		db,
		logger: { debug() {}, info() {}, warn() {}, error() {} },
		cursors: new InMemoryCursorStore(),
		config: { chainId: 56, backfillChunkSize: 2n },
	} as unknown as IndexerRuntime;
}

function createSource(
	events: FourMemeEvent[],
): FourMemeEventSource & { calls: Array<{ fromBlock: bigint; toBlock: bigint }> } {
	const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
	return {
		calls,
		contracts: { tokenManager2: tokenManager, agentIdentifier: tokenManager, erc8004IdentityRegistry: registry },
		async getLiveEvents() {
			throw new Error("not implemented");
		},
		async getBackfillEvents(input) {
			calls.push(input);
			return events.filter((event) => event.blockNumber >= input.fromBlock && event.blockNumber <= input.toBlock);
		},
	};
}

test("runFourMemeBackfill persists ERC-8004 Registered events and advances a backfill cursor", async () => {
	const db = new FakeDb(true);
	const runtime = createRuntime(db);
	const source = createSource([registered(11n, 2)]);

	const result = await runFourMemeBackfill(runtime, source, { fromBlock: 10n, toBlock: 12n, chunkSize: 2n });

	assert.equal(result.totalEvents, 1);
	assert.deepEqual(source.calls, [
		{ fromBlock: 10n, toBlock: 11n },
		{ fromBlock: 12n, toBlock: 12n },
	]);
	assert.equal((await runtime.cursors.read(result.cursorId))?.lastBlock, 12n);

	const insert = db.inserts.find((entry) => entry.table === schema.agentIdentities);
	assert.ok(insert, "agent identity insert should be recorded");
	assert.deepEqual(insert.value, {
		agentAddress: tokenAddress,
		standard: "erc-8004",
		chainId: 56,
		registry,
		agentIdOnchain: "1247",
		uri: "ipfs://bafybeigdyrztjsol8004",
		uriIpfs: "ipfs://bafybeigdyrztjsol8004",
		uriHttps: "https://ipfs.io/ipfs/bafybeigdyrztjsol8004",
		registrationTx: registered(11n, 2).txHash,
		registeredAt: registered(11n, 2).blockTimestamp,
		updatedAt: registered(11n, 2).blockTimestamp,
	});
});

test("runFourMemeBackfill resumes from the stored cursor instead of replaying old chunks", async () => {
	const runtime = createRuntime(new FakeDb(false));
	const source = createSource([registered(10n, 1), registered(12n, 1)]);

	const first = await runFourMemeBackfill(runtime, source, {
		fromBlock: 10n,
		toBlock: 10n,
		chunkSize: 1n,
		cursorId: "test:fourmeme:backfill",
	});
	assert.equal((await runtime.cursors.read(first.cursorId))?.lastBlock, 10n);

	source.calls.length = 0;
	await runFourMemeBackfill(runtime, source, {
		fromBlock: 10n,
		toBlock: 12n,
		chunkSize: 1n,
		cursorId: "test:fourmeme:backfill",
	});

	assert.deepEqual(source.calls, [
		{ fromBlock: 11n, toBlock: 11n },
		{ fromBlock: 12n, toBlock: 12n },
	]);
});
