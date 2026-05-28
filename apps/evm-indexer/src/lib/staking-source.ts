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
import type { StakingEvent } from "./staking-events.js";

// ---------------------------------------------------------------------------
// ABI (event signatures only)
// ---------------------------------------------------------------------------

export const veWaifuStakingAbi = parseAbi([
	"event Staked(address indexed user, uint256 amount)",
	"event Withdrawn(address indexed user, uint256 amount)",
	"event RewardClaimed(address indexed user, uint256 reward)",
	"event RewardNotified(uint256 reward)",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StakingEventSourceConfig {
	logger: Logger;
	chainId: number;
	veWaifuStaking: Address;
}

export interface StakingLiveEventResult {
	events: StakingEvent[];
	scannedToBlock: bigint;
}

export interface StakingEventSource {
	getLiveEvents(input: {
		cursor: IndexerCursor;
		maxBlocks: bigint;
	}): Promise<StakingLiveEventResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_BLOCKS_PER_RPC = 5000n;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

const INDEXED_STAKING_EVENTS: ReadonlySet<string> = new Set(["Staked", "Withdrawn", "RewardClaimed", "RewardNotified"]);

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
// ViemStakingEventSource
// ---------------------------------------------------------------------------

class ViemStakingEventSource implements StakingEventSource {
	private readonly client: PublicClient<Transport, Chain>;
	private readonly contractAddress: `0x${string}`;

	constructor(private readonly config: StakingEventSourceConfig) {
		const chain = config.chainId === 97 ? bscTestnet : bsc;
		const rpcUrl = process.env.BSC_RPC_URL || chain.rpcUrls.default.http[0];
		this.client = createPublicClient({
			chain,
			transport: http(rpcUrl),
		});

		this.contractAddress = config.veWaifuStaking as `0x${string}`;
	}

	async getLiveEvents(input: {
		cursor: IndexerCursor;
		maxBlocks: bigint;
	}): Promise<StakingLiveEventResult> {
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
			"fetching live VeWaifuStaking events",
		);

		const events = await this.fetchEvents(fromBlock, toBlock);

		this.config.logger.debug(
			{
				fromBlock: fromBlock.toString(),
				toBlock: toBlock.toString(),
				eventCount: events.length,
			},
			"live VeWaifuStaking events fetched",
		);

		return { events, scannedToBlock: toBlock };
	}

	private async fetchEvents(fromBlock: bigint, toBlock: bigint): Promise<StakingEvent[]> {
		const allEvents: StakingEvent[] = [];
		const blockTimestampCache = new Map<bigint, Date>();

		let chunkFrom = fromBlock;
		while (chunkFrom <= toBlock) {
			let chunkTo = chunkFrom + MAX_BLOCKS_PER_RPC - 1n;
			if (chunkTo > toBlock) chunkTo = toBlock;

			const logs = await withRetry(() =>
				this.client.getLogs({
					address: this.contractAddress,
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
	): Promise<StakingEvent | null> {
		if (log.blockNumber == null || log.transactionHash == null) return null;

		let decoded: { eventName: string; args: Record<string, unknown> };
		try {
			decoded = decodeEventLog({
				abi: veWaifuStakingAbi,
				data: log.data,
				topics: log.topics,
			}) as { eventName: string; args: Record<string, unknown> };
		} catch {
			return null;
		}

		if (!INDEXED_STAKING_EVENTS.has(decoded.eventName)) return null;

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
			case "Staked":
				return {
					...base,
					eventName: "Staked" as const,
					data: {
						user: args.user as Address,
						amount: (args.amount as bigint).toString(),
					},
				};
			case "Withdrawn":
				return {
					...base,
					eventName: "Withdrawn" as const,
					data: {
						user: args.user as Address,
						amount: (args.amount as bigint).toString(),
					},
				};
			case "RewardClaimed":
				return {
					...base,
					eventName: "RewardClaimed" as const,
					data: {
						user: args.user as Address,
						reward: (args.reward as bigint).toString(),
					},
				};
			case "RewardNotified":
				return {
					...base,
					eventName: "RewardNotified" as const,
					data: {
						reward: (args.reward as bigint).toString(),
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

export function createStakingEventSource(config: StakingEventSourceConfig): StakingEventSource {
	return new ViemStakingEventSource(config);
}
