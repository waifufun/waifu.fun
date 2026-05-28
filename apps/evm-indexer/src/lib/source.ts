import type { Logger } from "@waifufun/logger";
import { http, type Chain, type PublicClient, type Transport, createPublicClient, decodeEventLog } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import { portalAbi } from "@waifufun/flap";
import type { Address } from "./address.js";

import type { IndexerCursor } from "./cursor-store.js";
import type { PortalEvent } from "./events.js";

export interface PortalEventSourceConfig {
	logger: Logger;
	chainId: number;
	portalAddress: Address;
}

/** Result envelope for live polling — includes the scanned range so the
 *  caller can advance the cursor even when zero events are found. */
export interface LiveEventResult {
	events: PortalEvent[];
	scannedToBlock: bigint;
}

export interface PortalEventSource {
	getLiveEvents(input: { cursor: IndexerCursor; maxBlocks: bigint }): Promise<LiveEventResult>;
	getBackfillEvents(input: { fromBlock: bigint; toBlock: bigint }): Promise<PortalEvent[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** BSC public RPCs cap eth_getLogs at ~5 000 blocks. */
const MAX_BLOCKS_PER_RPC = 5000n;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

/** The five event types the indexer handlers consume. */
const INDEXED_EVENT_NAMES: ReadonlySet<string> = new Set([
	"TokenCreated",
	"TokenBought",
	"TokenSold",
	"FlapTokenProgressChanged",
	"LaunchedToDEX",
]);

/** WAD denominator used by the Portal progress value (1e18 = 100 %). */
const WAD = 10n ** 18n;

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (attempt < retries - 1) {
				await sleep(BASE_RETRY_DELAY_MS * 2 ** attempt);
			}
		}
	}
	throw lastError;
}

// ---------------------------------------------------------------------------
// ViemPortalEventSource
// ---------------------------------------------------------------------------

class ViemPortalEventSource implements PortalEventSource {
	private readonly client: PublicClient<Transport, Chain>;

	constructor(private readonly config: PortalEventSourceConfig) {
		const chain = config.chainId === 97 ? bscTestnet : bsc;
		const rpcUrl = process.env.BSC_RPC_URL || chain.rpcUrls.default.http[0];
		this.client = createPublicClient({
			chain,
			transport: http(rpcUrl),
		});
	}

	// ---- public interface ---------------------------------------------------

	async getLiveEvents(input: {
		cursor: IndexerCursor;
		maxBlocks: bigint;
	}): Promise<LiveEventResult> {
		const fromBlock = input.cursor.lastBlock + 1n;
		const latestBlock = await withRetry(() => this.client.getBlockNumber());

		let toBlock = fromBlock + input.maxBlocks - 1n;
		if (toBlock > latestBlock) toBlock = latestBlock;

		if (fromBlock > toBlock) {
			return { events: [], scannedToBlock: input.cursor.lastBlock };
		}

		this.config.logger.debug(
			{
				fromBlock: fromBlock.toString(),
				toBlock: toBlock.toString(),
				latestBlock: latestBlock.toString(),
			},
			"fetching live portal events",
		);

		const events = await this.fetchEvents(fromBlock, toBlock);

		this.config.logger.debug(
			{
				fromBlock: fromBlock.toString(),
				toBlock: toBlock.toString(),
				eventCount: events.length,
			},
			"live portal events fetched",
		);

		return { events, scannedToBlock: toBlock };
	}

	async getBackfillEvents(input: {
		fromBlock: bigint;
		toBlock: bigint;
	}): Promise<PortalEvent[]> {
		this.config.logger.debug(
			{
				fromBlock: input.fromBlock.toString(),
				toBlock: input.toBlock.toString(),
			},
			"fetching backfill portal events",
		);

		return this.fetchEvents(input.fromBlock, input.toBlock);
	}

	// ---- internal -----------------------------------------------------------

	private async fetchEvents(fromBlock: bigint, toBlock: bigint): Promise<PortalEvent[]> {
		const allEvents: PortalEvent[] = [];
		const blockTimestampCache = new Map<bigint, Date>();

		// Chunk the range to stay within BSC RPC limits.
		let chunkFrom = fromBlock;
		while (chunkFrom <= toBlock) {
			let chunkTo = chunkFrom + MAX_BLOCKS_PER_RPC - 1n;
			if (chunkTo > toBlock) chunkTo = toBlock;

			const logs = await withRetry(() =>
				this.client.getLogs({
					address: this.config.portalAddress as `0x${string}`,
					fromBlock: chunkFrom,
					toBlock: chunkTo,
				}),
			);

			for (const log of logs) {
				const event = await this.decodeAndMapLog(log, blockTimestampCache);
				if (event) allEvents.push(event);
			}

			chunkFrom = chunkTo + 1n;
		}

		// Guarantee deterministic ordering (block asc, logIndex asc).
		allEvents.sort((a, b) => {
			if (a.blockNumber !== b.blockNumber) {
				return a.blockNumber < b.blockNumber ? -1 : 1;
			}
			return a.logIndex - b.logIndex;
		});

		return allEvents;
	}

	/** Fetch (and cache) a block's timestamp. */
	private async getBlockTimestamp(blockNumber: bigint, cache: Map<bigint, Date>): Promise<Date> {
		const cached = cache.get(blockNumber);
		if (cached) return cached;

		const block = await withRetry(() => this.client.getBlock({ blockNumber }));
		const ts = new Date(Number(block.timestamp) * 1_000);
		cache.set(blockNumber, ts);
		return ts;
	}

	/** Decode a raw log into a normalised PortalEvent, or null if not relevant. */
	private async decodeAndMapLog(
		log: {
			data: `0x${string}`;
			topics: [`0x${string}`, ...`0x${string}`[]] | [];
			blockNumber: bigint;
			transactionHash: `0x${string}`;
			logIndex: number;
		},
		blockTimestampCache: Map<bigint, Date>,
	): Promise<PortalEvent | null> {
		// Skip logs missing confirmed block data (shouldn't happen with getLogs).
		if (log.blockNumber == null || log.transactionHash == null) return null;

		let decoded: ReturnType<typeof decodeEventLog<typeof portalAbi>>;
		try {
			decoded = decodeEventLog({
				abi: portalAbi,
				data: log.data,
				topics: log.topics,
			});
		} catch {
			// Unrecognised event signature — skip silently.
			return null;
		}

		if (!INDEXED_EVENT_NAMES.has(decoded.eventName)) return null;

		const args = decoded.args as Record<string, unknown>;

		const base = {
			chainId: this.config.chainId,
			portalAddress: this.config.portalAddress,
			blockNumber: log.blockNumber,
			txHash: log.transactionHash,
			logIndex: log.logIndex,
		};

		switch (decoded.eventName) {
			case "TokenCreated": {
				return {
					...base,
					eventName: "TokenCreated" as const,
					blockTimestamp: new Date(Number(args.ts as bigint) * 1_000),
					data: {
						tokenAddress: args.token as Address,
						creatorAddress: args.creator as Address,
						name: args.name as string,
						symbol: args.symbol as string,
						metadataUri: (args.meta as string) || undefined,
					},
				};
			}

			case "TokenBought": {
				return {
					...base,
					eventName: "TokenBought" as const,
					blockTimestamp: new Date(Number(args.ts as bigint) * 1_000),
					data: {
						tokenAddress: args.token as Address,
						buyerAddress: args.buyer as Address,
						quoteAmount: (args.eth as bigint).toString(),
						tokenAmount: (args.amount as bigint).toString(),
						postPrice: (args.postPrice as bigint).toString(),
					},
				};
			}

			case "TokenSold": {
				return {
					...base,
					eventName: "TokenSold" as const,
					blockTimestamp: new Date(Number(args.ts as bigint) * 1_000),
					data: {
						tokenAddress: args.token as Address,
						sellerAddress: args.seller as Address,
						quoteAmount: (args.eth as bigint).toString(),
						tokenAmount: (args.amount as bigint).toString(),
						postPrice: (args.postPrice as bigint).toString(),
					},
				};
			}

			case "FlapTokenProgressChanged": {
				const blockTimestamp = await this.getBlockTimestamp(log.blockNumber, blockTimestampCache);
				const newProgress = args.newProgress as bigint;
				// WAD → basis-points (10 000 = 100 %).
				const progressBps = Number((newProgress * 10_000n) / WAD);
				return {
					...base,
					eventName: "FlapTokenProgressChanged" as const,
					blockTimestamp,
					data: {
						tokenAddress: args.token as Address,
						progressBps,
					},
				};
			}

			case "LaunchedToDEX": {
				const blockTimestamp = await this.getBlockTimestamp(log.blockNumber, blockTimestampCache);
				return {
					...base,
					eventName: "LaunchedToDEX" as const,
					blockTimestamp,
					data: {
						tokenAddress: args.token as Address,
						poolAddress: args.pool as Address,
					},
				};
			}

			default:
				return null;
		}
	}
}

export function createPortalEventSource(config: PortalEventSourceConfig): PortalEventSource {
	return new ViemPortalEventSource(config);
}
