import type { Logger } from "@waifufun/logger";
import {
	http,
	type Chain,
	type PublicClient,
	type Transport,
	createPublicClient,
	decodeEventLog,
	parseAbi,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";

import type { Address } from "./address.js";

import type { IndexerCursor } from "./cursor-store.js";
import type { FourMemeEvent } from "./fourmeme-events.js";

// ---------------------------------------------------------------------------
// ABIs (event signatures only — matches Four.Meme TokenManager2 + AgentIdentifier)
// ---------------------------------------------------------------------------

export const tokenManager2EventsAbi = parseAbi([
	"event TokenCreate(address creator, address token, uint256 requestId, string name, string symbol, uint256 totalSupply, uint256 launchTime, uint256 launchFee)",
	"event TokenPurchase(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)",
	"event TokenSale(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)",
	"event LiquidityAdded(address base, uint256 offers, address quote, uint256 funds)",
	"event TradeStop(address token)",
]);

export const agentIdentifierEventsAbi = parseAbi([
	"event NftAdded(address indexed nft)",
	"event NftRemoved(address indexed nft)",
]);

const allFourMemeAbis = [...tokenManager2EventsAbi, ...agentIdentifierEventsAbi];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FourMemeContractAddresses {
	tokenManager2: Address;
	agentIdentifier: Address;
}

export interface FourMemeEventSourceConfig {
	logger: Logger;
	chainId: number;
	contracts: FourMemeContractAddresses;
}

export interface FourMemeLiveEventResult {
	events: FourMemeEvent[];
	scannedToBlock: bigint;
}

export interface FourMemeEventSource {
	readonly contracts: FourMemeContractAddresses;
	getLiveEvents(input: {
		cursor: IndexerCursor;
		maxBlocks: bigint;
	}): Promise<FourMemeLiveEventResult>;
	getBackfillEvents(input: { fromBlock: bigint; toBlock: bigint }): Promise<FourMemeEvent[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_BLOCKS_PER_RPC = 500n;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

const INDEXED_FOURMEME_EVENTS: ReadonlySet<string> = new Set([
	"TokenCreate",
	"TokenPurchase",
	"TokenSale",
	"LiquidityAdded",
	"TradeStop",
	"NftAdded",
	"NftRemoved",
]);

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
// ViemFourMemeEventSource
// ---------------------------------------------------------------------------

class ViemFourMemeEventSource implements FourMemeEventSource {
	private readonly client: PublicClient<Transport, Chain>;
	private readonly contractAddresses: `0x${string}`[];

	constructor(private readonly config: FourMemeEventSourceConfig) {
		const chain = config.chainId === 97 ? bscTestnet : bsc;
		const rpcUrl = process.env.BSC_RPC_URL || chain.rpcUrls.default.http[0];
		this.client = createPublicClient({
			chain,
			transport: http(rpcUrl),
		});

		this.contractAddresses = Array.from(
			new Set([config.contracts.tokenManager2 as `0x${string}`, config.contracts.agentIdentifier as `0x${string}`]),
		);
	}

	get contracts(): FourMemeContractAddresses {
		return this.config.contracts;
	}

	async getLiveEvents(input: {
		cursor: IndexerCursor;
		maxBlocks: bigint;
	}): Promise<FourMemeLiveEventResult> {
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
			"fetching live four.meme events",
		);

		const events = await this.fetchEvents(fromBlock, toBlock);

		this.config.logger.debug(
			{
				fromBlock: fromBlock.toString(),
				toBlock: toBlock.toString(),
				eventCount: events.length,
			},
			"live four.meme events fetched",
		);

		return { events, scannedToBlock: toBlock };
	}

	async getBackfillEvents(input: { fromBlock: bigint; toBlock: bigint }): Promise<FourMemeEvent[]> {
		this.config.logger.debug(
			{
				fromBlock: input.fromBlock.toString(),
				toBlock: input.toBlock.toString(),
			},
			"fetching backfill four.meme events",
		);

		return this.fetchEvents(input.fromBlock, input.toBlock);
	}

	private async fetchEvents(fromBlock: bigint, toBlock: bigint): Promise<FourMemeEvent[]> {
		const allEvents: FourMemeEvent[] = [];
		const blockTimestampCache = new Map<bigint, Date>();

		let chunkFrom = fromBlock;
		while (chunkFrom <= toBlock) {
			let chunkTo = chunkFrom + MAX_BLOCKS_PER_RPC - 1n;
			if (chunkTo > toBlock) chunkTo = toBlock;

			// Fetch logs from all four.meme contracts in one RPC call
			const logs = await withRetry(() =>
				this.client.getLogs({
					address: this.contractAddresses,
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

		// Deterministic ordering
		allEvents.sort((a, b) => {
			if (a.blockNumber !== b.blockNumber) {
				return a.blockNumber < b.blockNumber ? -1 : 1;
			}
			return a.logIndex - b.logIndex;
		});

		return allEvents;
	}

	private async getBlockTimestamp(blockNumber: bigint, cache: Map<bigint, Date>): Promise<Date> {
		const cached = cache.get(blockNumber);
		if (cached) return cached;

		const block = await withRetry(() => this.client.getBlock({ blockNumber }));
		const ts = new Date(Number(block.timestamp) * 1_000);
		cache.set(blockNumber, ts);
		return ts;
	}

	private async decodeAndMapLog(
		log: {
			address: `0x${string}`;
			data: `0x${string}`;
			topics: [`0x${string}`, ...`0x${string}`[]] | [];
			blockNumber: bigint;
			transactionHash: `0x${string}`;
			logIndex: number;
		},
		blockTimestampCache: Map<bigint, Date>,
	): Promise<FourMemeEvent | null> {
		if (log.blockNumber == null || log.transactionHash == null) return null;

		let decoded: { eventName: string; args: Record<string, unknown> };
		try {
			decoded = decodeEventLog({
				abi: allFourMemeAbis,
				data: log.data,
				topics: log.topics,
			}) as { eventName: string; args: Record<string, unknown> };
		} catch {
			return null;
		}

		if (!INDEXED_FOURMEME_EVENTS.has(decoded.eventName)) return null;

		const blockTimestamp = await this.getBlockTimestamp(log.blockNumber, blockTimestampCache);
		const args = decoded.args;

		const base = {
			chainId: this.config.chainId,
			contractAddress: log.address as Address,
			blockNumber: log.blockNumber,
			txHash: log.transactionHash,
			logIndex: log.logIndex,
			blockTimestamp,
		};

		switch (decoded.eventName) {
			case "TokenCreate":
				return {
					...base,
					eventName: "TokenCreate" as const,
					data: {
						creator: args.creator as Address,
						token: args.token as Address,
						requestId: (args.requestId as bigint).toString(),
						name: args.name as string,
						symbol: args.symbol as string,
						totalSupply: (args.totalSupply as bigint).toString(),
						launchTime: (args.launchTime as bigint).toString(),
						launchFee: (args.launchFee as bigint).toString(),
					},
				};

			case "TokenPurchase":
				return {
					...base,
					eventName: "TokenPurchase" as const,
					data: {
						token: args.token as Address,
						account: args.account as Address,
						price: (args.price as bigint).toString(),
						amount: (args.amount as bigint).toString(),
						cost: (args.cost as bigint).toString(),
						fee: (args.fee as bigint).toString(),
						offers: (args.offers as bigint).toString(),
						funds: (args.funds as bigint).toString(),
					},
				};

			case "TokenSale":
				return {
					...base,
					eventName: "TokenSale" as const,
					data: {
						token: args.token as Address,
						account: args.account as Address,
						price: (args.price as bigint).toString(),
						amount: (args.amount as bigint).toString(),
						cost: (args.cost as bigint).toString(),
						fee: (args.fee as bigint).toString(),
						offers: (args.offers as bigint).toString(),
						funds: (args.funds as bigint).toString(),
					},
				};

			case "LiquidityAdded":
				return {
					...base,
					eventName: "LiquidityAdded" as const,
					data: {
						base: args.base as Address,
						offers: (args.offers as bigint).toString(),
						quote: args.quote as Address,
						funds: (args.funds as bigint).toString(),
					},
				};

			case "TradeStop":
				return {
					...base,
					eventName: "TradeStop" as const,
					data: {
						token: args.token as Address,
					},
				};

			case "NftAdded":
				return {
					...base,
					eventName: "NftAdded" as const,
					data: {
						nft: args.nft as Address,
					},
				};

			case "NftRemoved":
				return {
					...base,
					eventName: "NftRemoved" as const,
					data: {
						nft: args.nft as Address,
					},
				};

			default:
				return null;
		}
	}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFourMemeEventSource(config: FourMemeEventSourceConfig): FourMemeEventSource {
	return new ViemFourMemeEventSource(config);
}
