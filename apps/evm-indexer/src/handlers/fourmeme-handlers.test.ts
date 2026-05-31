import assert from "node:assert/strict";
import { test } from "node:test";
import { schema } from "@waifufun/db";

import type { LaunchedToDexEvent } from "../lib/events.js";
import type {
	LiquidityAddedEvent,
	TokenCreateEvent,
	TokenPurchaseEvent,
	TokenSaleEvent,
} from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { buildLiquidityAddedProvisioningJob, handleLiquidityAddedEvent } from "./fourmeme-liquidity-added.js";
import { handleTokenCreateEvent } from "./fourmeme-token-create.js";
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

	onConflictDoUpdate() {
		return this;
	}

	onConflictDoNothing() {
		return this;
	}

	returning() {
		if (this.table === schema.events) return Promise.resolve([{ id: 1n }]);
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

test("LiquidityAdded provisioning job payload launches Eliza Cloud for graduated agent token", () => {
	assert.deepEqual(buildLiquidityAddedProvisioningJob("agent-test", liquidityAddedEvent()), {
		agentId: "agent-test",
		source: "agent.graduated",
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

test("LiquidityAdded handler enqueues Eliza Cloud provisioning for tracked graduated agent token", async () => {
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
	} finally {
		if (previousDisable === undefined) delete process.env.INDEXER_DISABLE_QUEUE_JOBS;
		else process.env.INDEXER_DISABLE_QUEUE_JOBS = previousDisable;
	}
});

test("LaunchedToDEX provisioning job payload launches Eliza Cloud for migrated token", () => {
	assert.deepEqual(buildLaunchedToDexProvisioningJob("agent-test", launchedToDexEvent()), {
		agentId: "agent-test",
		source: "token.migrated",
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

test("LaunchedToDEX handler enqueues Eliza Cloud provisioning for migrated agent token", async () => {
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
});
