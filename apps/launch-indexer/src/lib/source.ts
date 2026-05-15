/**
 * Launch event source. Wraps a viem `PublicClient` to fetch logs from the
 * LaunchFactory + per-launch LaunchVault / BundleRouter contracts in
 * fixed-size block windows.
 */

import type { Logger } from "@waifufun/logger";
import { http, type Address, type Chain, type Hex, type PublicClient, type Transport, createPublicClient } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import { decodeLaunchLog } from "./decode.js";
import type { LaunchEvent } from "./events.js";

const MAX_BLOCKS_PER_RPC = 500n;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

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

export interface LaunchEventSourceConfig {
	logger: Logger;
	chainId: number;
	rpcUrl?: string;
	publicClient?: PublicClient<Transport, Chain>;
}

export interface LaunchEventSource {
	getLatestBlock(): Promise<bigint>;
	getEvents(input: {
		addresses: Address[];
		fromBlock: bigint;
		toBlock: bigint;
	}): Promise<LaunchEvent[]>;
}

class ViemLaunchEventSource implements LaunchEventSource {
	private readonly client: PublicClient<Transport, Chain>;

	constructor(private readonly config: LaunchEventSourceConfig) {
		if (config.publicClient) {
			this.client = config.publicClient;
			return;
		}
		const chain = config.chainId === 97 ? bscTestnet : bsc;
		const rpcUrl = config.rpcUrl ?? process.env.BSC_RPC_URL ?? chain.rpcUrls.default.http[0];
		this.client = createPublicClient({
			chain,
			transport: http(rpcUrl),
		});
	}

	async getLatestBlock(): Promise<bigint> {
		return withRetry(() => this.client.getBlockNumber());
	}

	async getEvents(input: {
		addresses: Address[];
		fromBlock: bigint;
		toBlock: bigint;
	}): Promise<LaunchEvent[]> {
		if (input.addresses.length === 0) {
			return [];
		}
		if (input.fromBlock > input.toBlock) {
			return [];
		}

		const events: LaunchEvent[] = [];
		const blockTimestamps = new Map<bigint, Date>();

		// De-dupe + lowercase normalize
		const addresses = Array.from(new Set(input.addresses.map((a) => a.toLowerCase()))) as `0x${string}`[];

		let chunkFrom = input.fromBlock;
		while (chunkFrom <= input.toBlock) {
			let chunkTo = chunkFrom + MAX_BLOCKS_PER_RPC - 1n;
			if (chunkTo > input.toBlock) chunkTo = input.toBlock;

			const logs = await withRetry(() =>
				this.client.getLogs({
					address: addresses,
					fromBlock: chunkFrom,
					toBlock: chunkTo,
				}),
			);

			for (const log of logs) {
				if (log.blockNumber == null || log.transactionHash == null) continue;
				const blockTimestamp = await this.getBlockTimestamp(log.blockNumber, blockTimestamps);
				const decoded = decodeLaunchLog({
					log: {
						address: log.address,
						data: log.data as Hex,
						topics: log.topics as [Hex, ...Hex[]] | [],
						blockNumber: log.blockNumber,
						transactionHash: log.transactionHash,
						logIndex: log.logIndex ?? 0,
					},
					chainId: this.config.chainId,
					blockTimestamp,
				});
				if (decoded) events.push(decoded);
			}

			chunkFrom = chunkTo + 1n;
		}

		events.sort((a, b) => {
			if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
			return a.logIndex - b.logIndex;
		});

		return events;
	}

	private async getBlockTimestamp(blockNumber: bigint, cache: Map<bigint, Date>): Promise<Date> {
		const cached = cache.get(blockNumber);
		if (cached) return cached;
		const block = await withRetry(() => this.client.getBlock({ blockNumber }));
		const ts = new Date(Number(block.timestamp) * 1_000);
		cache.set(blockNumber, ts);
		return ts;
	}
}

export function createLaunchEventSource(config: LaunchEventSourceConfig): LaunchEventSource {
	return new ViemLaunchEventSource(config);
}
