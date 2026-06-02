import assert from "node:assert/strict";
import { test } from "node:test";
import { schema } from "@waifufun/db";

import type { LaunchedToDexEvent } from "../lib/events.js";
import type {
	Erc8004RegisteredEvent,
	LiquidityAddedEvent,
	TokenCreateEvent,
	TokenPurchaseEvent,
	TokenSaleEvent,
} from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { handleErc8004RegisteredEvent, parseAgentUri } from "./erc8004-registered.js";
import { buildLiquidityAddedProvisioningJob, handleLiquidityAddedEvent } from "./fourmeme-liquidity-added.js";
import { buildTokenCreateProvisioningJob, handleTokenCreateEvent } from "./fourmeme-token-create.js";
import { handleTokenPurchaseEvent } from "./fourmeme-token-purchase.js";
import { handleTokenSaleEvent } from "./fourmeme-token-sale.js";
import { buildLaunchedToDexProvisioningJob, handleLaunchedToDexEvent } from "./launched-to-dex.js";

const tokenAddress = "0x00000000000000000000000000000000000000a1" as const;
const creatorAddress = "0x00000000000000000000000000000000000000b2" as const;
const traderAddress = "0x00000000000000000000000000000000000000c3" as const;
const contractAddress = "0x00000000000000000000000000000000000000d4" as const;

process.env.INDEXER_DISABLE_QUEUE_JOBS = "1";

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

	onConflictDoNothing() {
		return this;
	}

	returning() {
		if (this.table === schema.events) return Promise.resolve([{ id: 1n }]);
		if (this.table === schema.agentEvents) {
			const value = this.db.inserts.at(-1)?.value as Record<string, unknown>;
			return Promise.resolve([
				{
					id: "agent-event-id",
					type: value.type,
					eventType: value.eventType,
					tokenAddress: value.tokenAddress,
					agentId: value.agentId,
					data: value.data,
					payload: value.payload,
					createdAt: new Date("2026-04-24T00:05:00.000Z"),
				},
			]);
		}
		return Promise.resolve([]);
	}
}

class UpdateBuilder {
	private value: unknown;

	constructor(
		private readonly db: FakeDb,
		private readonly table: unknown,
	) {}

	set(value: unknown) {
		this.value = value;
		return this;
	}

	where() {
		this.db.updates.push({ table: this.table, value: this.value });
		return makeUpdateResult();
	}
}

// Drizzle update().set().where() can be awaited directly OR chained with .returning().
// Return a thenable promise with .returning() attached as a method.
function makeUpdateResult(): Promise<unknown[]> & { returning: () => Promise<unknown[]> } {
	const promise = Promise.resolve([] as unknown[]) as Promise<unknown[]> & {
		returning: () => Promise<unknown[]>;
	};
	promise.returning = () => Promise.resolve([] as unknown[]);
	return promise;
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

	orderBy() {
		return this;
	}

	limit() {
		if (this.table === schema.agentWallets) {
			return Promise.resolve(
				this.db.knownWallet ? [{ id: "wallet-id", internalAgentId: "agent-test", agentToken: tokenAddress }] : [],
			);
		}

		if (this.table === schema.curveState) {
			return Promise.resolve(this.db.trackedToken ? [{ agentToken: tokenAddress }] : []);
		}

		return Promise.resolve([]);
	}
}

class FakeDb {
	inserts: Array<{ table: unknown; value: unknown }> = [];
	updates: Array<{ table: unknown; value: unknown }> = [];
	conflicts: Array<{ table: unknown; input: unknown }> = [];

	constructor(
		readonly knownWallet = true,
		readonly trackedToken = true,
	) {}

	transaction<T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> {
		return callback(this);
	}

	insert(table: unknown) {
		return new InsertBuilder(this, table);
	}

	update(table: unknown) {
		return new UpdateBuilder(this, table);
	}

	select() {
		return new SelectBuilder(this);
	}
}

function createRuntime(db = new FakeDb()) {
	const emitted: unknown[] = [];
	const runtime = {
		db,
		logger: { debug() {}, info() {}, warn() {}, error() {} },
		webhooks: {
			emit(input: unknown) {
				emitted.push(input);
			},
		},
	} as unknown as IndexerRuntime;

	return { runtime, db, emitted };
}

function erc8004RegisteredEvent(agentURI = "ipfs://bafybeigdyrztjsol8004"): Erc8004RegisteredEvent {
	return {
		eventName: "Registered",
		chainId: 56,
		contractAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
		blockNumber: 456n,
		txHash: "0x0000000000000000000000000000000000000000000000000000000000000456",
		logIndex: 2,
		blockTimestamp: new Date("2026-06-02T19:00:00.000Z"),
		data: {
			agentId: "1247",
			agentURI,
			owner: creatorAddress,
		},
	};
}

function tokenCreateEvent(): TokenCreateEvent {
	return {
		eventName: "TokenCreate",
		chainId: 56,
		contractAddress,
		blockNumber: 123n,
		txHash: "0x0000000000000000000000000000000000000000000000000000000000000123",
		logIndex: 1,
		blockTimestamp: new Date("2026-04-24T00:00:00.000Z"),
		data: {
			creator: creatorAddress,
			token: tokenAddress,
			requestId: "42",
			name: "Test Waifu",
			symbol: "TWAI",
			totalSupply: "1000000000000000000000000000",
			launchTime: "1",
			launchFee: "0",
		},
	};
}

function tokenPurchaseEvent(): TokenPurchaseEvent {
	return {
		eventName: "TokenPurchase",
		chainId: 56,
		contractAddress,
		blockNumber: 124n,
		txHash: "0x0000000000000000000000000000000000000000000000000000000000000124",
		logIndex: 2,
		blockTimestamp: new Date("2026-04-24T00:01:00.000Z"),
		data: {
			token: tokenAddress,
			account: traderAddress,
			price: "100",
			amount: "10",
			cost: "1000",
			fee: "20",
			offers: "10",
			funds: "1000",
		},
	};
}

function tokenSaleEvent(): TokenSaleEvent {
	return {
		...tokenPurchaseEvent(),
		eventName: "TokenSale",
		txHash: "0x0000000000000000000000000000000000000000000000000000000000000125",
		logIndex: 3,
	};
}

function liquidityAddedEvent(): LiquidityAddedEvent {
	return {
		eventName: "LiquidityAdded",
		chainId: 56,
		contractAddress,
		blockNumber: 126n,
		txHash: "0x0000000000000000000000000000000000000000000000000000000000000126",
		logIndex: 4,
		blockTimestamp: new Date("2026-04-24T00:03:00.000Z"),
		data: {
			base: tokenAddress,
			offers: "1000000",
			quote: "0x00000000000000000000000000000000000000e5",
			funds: "500000",
		},
	};
}

function launchedToDexEvent(): LaunchedToDexEvent {
	return {
		eventName: "LaunchedToDEX",
		chainId: 56,
		portalAddress: contractAddress,
		blockNumber: 127n,
		txHash: "0x0000000000000000000000000000000000000000000000000000000000000127",
		logIndex: 5,
		blockTimestamp: new Date("2026-04-24T00:04:00.000Z"),
		data: {
			tokenAddress,
			poolAddress: "0x00000000000000000000000000000000000000f6",
			dexName: "pancakeswap",
		},
	};
}

test("TokenCreate writes token, curve state, and token.created webhook", async () => {
	const { runtime, db, emitted } = createRuntime();

	await handleTokenCreateEvent(runtime, tokenCreateEvent());

	assert.equal(
		db.inserts.some((insert) => insert.table === schema.tokens),
		true,
	);
	assert.equal(
		db.inserts.some((insert) => insert.table === schema.curveState),
		true,
	);
	assert.deepEqual((emitted[0] as { event: string }).event, "token.created");
});

test("TokenCreate provisioning job payload launches Eliza Cloud at token launch", () => {
	assert.deepEqual(buildTokenCreateProvisioningJob("agent-test", tokenCreateEvent()), {
		agentId: "agent-test",
		source: "agent.launched",
		data: {
			tokenAddress,
			tokenContractAddress: tokenAddress,
			chain: "bsc",
			chainId: 56,
			tokenName: "Test Waifu",
			tokenTicker: "TWAI",
			launchType: "native",
			txHash: "0x0000000000000000000000000000000000000000000000000000000000000123",
			blockNumber: "123",
		},
	});
});

test("TokenPurchase writes buy trade, updates token metrics, and emits trade webhook", async () => {
	const { runtime, db, emitted } = createRuntime();

	await handleTokenPurchaseEvent(runtime, tokenPurchaseEvent());

	const tradeInsert = db.inserts.find((insert) => insert.table === schema.trades);
	assert.equal((tradeInsert?.value as { side: string }).side, "buy");
	assert.equal(
		db.updates.some((update) => update.table === schema.tokens),
		true,
	);
	assert.deepEqual((emitted[0] as { event: string }).event, "trade.happened");
});

test("TokenSale writes sell trade, updates token metrics, and emits trade webhook", async () => {
	const { runtime, db, emitted } = createRuntime();

	await handleTokenSaleEvent(runtime, tokenSaleEvent());

	const tradeInsert = db.inserts.find((insert) => insert.table === schema.trades);
	assert.equal((tradeInsert?.value as { side: string }).side, "sell");
	assert.equal(
		db.updates.some((update) => update.table === schema.tokens),
		true,
	);
	assert.deepEqual((emitted[0] as { event: string }).event, "trade.happened");
});

test("LiquidityAdded provisioning job payload launches Eliza Cloud for bonded agent token", () => {
	assert.deepEqual(buildLiquidityAddedProvisioningJob("agent-test", liquidityAddedEvent()), {
		agentId: "agent-test",
		source: "agent.bonded",
		data: {
			tokenAddress,
			tokenContractAddress: tokenAddress,
			chain: "bsc",
			chainId: 56,
			launchType: "native",
			txHash: "0x0000000000000000000000000000000000000000000000000000000000000126",
			blockNumber: "126",
			quoteAddress: "0x00000000000000000000000000000000000000e5",
		},
	});
});

test("LiquidityAdded handler enqueues Eliza Cloud provisioning for tracked bonded agent token", async () => {
	const previousDisable = process.env.INDEXER_DISABLE_QUEUE_JOBS;
	delete process.env.INDEXER_DISABLE_QUEUE_JOBS;
	const { runtime } = createRuntime();
	const enqueued: Array<{ kind: string; payload: unknown; options?: { jobId?: string } }> = [];
	runtime.enqueueCacheWarm = async (payload, options) => {
		enqueued.push({ kind: "cache-warm", payload, options });
	};
	runtime.enqueueNotification = async (payload, options) => {
		enqueued.push({ kind: "notification", payload, options });
	};
	runtime.enqueueAgentProvisioning = async (payload, options) => {
		enqueued.push({ kind: "agent-provisioning", payload, options });
	};

	try {
		const event = liquidityAddedEvent();
		const result = await handleLiquidityAddedEvent(runtime, event);

		assert.deepEqual(result.enqueuedJobs, ["cache-warm", "notification", "agent-provisioning"]);
		assert.deepEqual(
			enqueued.find((job) => job.kind === "agent-provisioning"),
			{
				kind: "agent-provisioning",
				payload: buildLiquidityAddedProvisioningJob("agent-test", event),
				options: {
					jobId: `indexer-fourmeme:${event.txHash}-${event.logIndex}-agent-provisioning-agent-test`,
				},
			},
		);
		const agentEvents = (runtime.db as unknown as FakeDb).inserts.filter(
			(insert) => insert.table === schema.agentEvents,
		);
		assert.deepEqual(
			agentEvents.map((insert) => (insert.value as { eventType: string }).eventType),
			["agent.bonded", "agent.graduated"],
		);
	} finally {
		if (previousDisable === undefined) delete process.env.INDEXER_DISABLE_QUEUE_JOBS;
		else process.env.INDEXER_DISABLE_QUEUE_JOBS = previousDisable;
	}
});

test("LaunchedToDEX provisioning job payload launches Eliza Cloud for bonded token", () => {
	assert.deepEqual(buildLaunchedToDexProvisioningJob("agent-test", launchedToDexEvent()), {
		agentId: "agent-test",
		source: "agent.bonded",
		data: {
			tokenAddress,
			tokenContractAddress: tokenAddress,
			chain: "bsc",
			chainId: 56,
			launchType: "native",
			txHash: "0x0000000000000000000000000000000000000000000000000000000000000127",
			blockNumber: "127",
			poolAddress: "0x00000000000000000000000000000000000000f6",
			dexName: "pancakeswap",
		},
	});
});

test("LaunchedToDEX handler enqueues Eliza Cloud provisioning for bonded agent token", async () => {
	const { runtime } = createRuntime();
	const enqueued: Array<{ kind: string; payload: unknown; options?: { jobId?: string } }> = [];
	runtime.enqueueCacheWarm = async (payload, options) => {
		enqueued.push({ kind: "cache-warm", payload, options });
	};
	runtime.enqueueNotification = async (payload, options) => {
		enqueued.push({ kind: "notification", payload, options });
	};
	runtime.enqueueAgentProvisioning = async (payload, options) => {
		enqueued.push({ kind: "agent-provisioning", payload, options });
	};

	const event = launchedToDexEvent();
	const result = await handleLaunchedToDexEvent(runtime, event);

	assert.deepEqual(result.enqueuedJobs, ["cache-warm", "notification", "agent-provisioning"]);
	assert.deepEqual(
		enqueued.find((job) => job.kind === "agent-provisioning"),
		{
			kind: "agent-provisioning",
			payload: buildLaunchedToDexProvisioningJob("agent-test", event),
			options: {
				jobId: `indexer-${event.txHash}-${event.logIndex}-agent-provisioning-agent-test`,
			},
		},
	);
	const agentEvents = (runtime.db as unknown as FakeDb).inserts.filter((insert) => insert.table === schema.agentEvents);
	assert.deepEqual(
		agentEvents.map((insert) => (insert.value as { eventType: string }).eventType),
		["agent.bonded", "agent.graduated"],
	);
});

test("parseAgentUri decodes data JSON and derives embedded ipfs gateway URL", () => {
	const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify({ metadataIpfsUri: "ipfs://bafyjson" })).toString("base64")}`;
	assert.deepEqual(parseAgentUri(agentURI), {
		uriIpfs: "ipfs://bafyjson",
		uriHttps: "https://ipfs.io/ipfs/bafyjson",
		decodedJson: { metadataIpfsUri: "ipfs://bafyjson" },
	});
});

test("handleErc8004RegisteredEvent upserts managed wallet identity", async () => {
	const { runtime, db } = createRuntime(new FakeDb(true));
	const event = erc8004RegisteredEvent();

	const result = await handleErc8004RegisteredEvent(runtime, event);

	assert.deepEqual(result, { handled: true, enqueuedJobs: [] });
	const insert = db.inserts.find((entry) => entry.table === schema.agentIdentities);
	assert.ok(insert, "agent identity insert should be recorded");
	assert.deepEqual(insert.value, {
		agentAddress: tokenAddress,
		standard: "erc-8004",
		chainId: 56,
		registry: event.contractAddress,
		agentIdOnchain: "1247",
		uri: event.data.agentURI,
		uriIpfs: "ipfs://bafybeigdyrztjsol8004",
		uriHttps: "https://ipfs.io/ipfs/bafybeigdyrztjsol8004",
		registrationTx: event.txHash,
		registeredAt: event.blockTimestamp,
		updatedAt: event.blockTimestamp,
	});
	assert.equal(db.conflicts.filter((entry) => entry.table === schema.agentIdentities).length, 1);
});

test("handleErc8004RegisteredEvent skips non-owned owner", async () => {
	const { runtime, db } = createRuntime(new FakeDb(false));

	const result = await handleErc8004RegisteredEvent(runtime, erc8004RegisteredEvent());

	assert.deepEqual(result, { handled: false, enqueuedJobs: [] });
	assert.equal(db.inserts.filter((entry) => entry.table === schema.agentIdentities).length, 0);
});
