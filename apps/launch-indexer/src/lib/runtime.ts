import { type Database, getDatabase } from "@waifufun/db";
import type { Logger } from "@waifufun/logger";
import type { Address, Chain } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import { type CursorStore, DrizzleCursorStore } from "./cursor-store.js";
import { logger } from "./logger.js";
import { type LaunchEventSource, createLaunchEventSource } from "./source.js";

export interface LaunchIndexerConfig {
	chainId: number;
	launchFactoryAddress: Address;
	portalAddress?: Address;
	flapTokenFactoryAddress?: Address;
	rpcUrl: string;
	startBlock: bigint;
	pollIntervalMs: number;
	maxBlocksPerPoll: bigint;
	confirmations: bigint;
}

export interface LaunchIndexerRuntime {
	db: Database;
	logger: Logger;
	cursors: CursorStore;
	source: LaunchEventSource;
	config: LaunchIndexerConfig;
}

export function getBscChain(chainId: number): Chain {
	return chainId === 97 ? bscTestnet : bsc;
}

export function createLaunchIndexerConfig(): LaunchIndexerConfig {
	const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);
	const chain = getBscChain(chainId);
	const launchFactoryAddress = process.env.LAUNCH_FACTORY_ADDRESS as Address | undefined;
	if (!launchFactoryAddress) {
		throw new Error("LAUNCH_FACTORY_ADDRESS env var is required");
	}

	const alchemyKey = process.env.ALCHEMY_BSC_KEY;
	const defaultRpc =
		alchemyKey != null && alchemyKey !== ""
			? chainId === 97
				? `https://bnb-testnet.g.alchemy.com/v2/${alchemyKey}`
				: `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`
			: chain.rpcUrls.default.http[0]!;
	const rpcUrl = process.env.BSC_RPC_URL ?? defaultRpc;

	return {
		chainId,
		launchFactoryAddress,
		portalAddress: (process.env.FLAP_PORTAL_ADDRESS ?? "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0") as Address,
		flapTokenFactoryAddress: process.env.FLAP_TOKEN_FACTORY_ADDRESS as Address | undefined,
		rpcUrl,
		startBlock: BigInt(process.env.LAUNCH_INDEXER_START_BLOCK ?? "0"),
		pollIntervalMs: Number(process.env.LAUNCH_INDEXER_POLL_INTERVAL_MS ?? 5_000),
		maxBlocksPerPoll: BigInt(process.env.LAUNCH_INDEXER_MAX_BLOCKS ?? "500"),
		confirmations: BigInt(process.env.LAUNCH_INDEXER_CONFIRMATIONS ?? "3"),
	};
}

export function createLaunchIndexerRuntime(): LaunchIndexerRuntime {
	const config = createLaunchIndexerConfig();
	const { db } = getDatabase();
	return {
		db,
		logger,
		cursors: new DrizzleCursorStore(db, logger, config.chainId),
		source: createLaunchEventSource({
			logger,
			chainId: config.chainId,
			rpcUrl: config.rpcUrl,
		}),
		config,
	};
}

export function factoryCursorId(chainId: number, factory: Address): string {
	return `launch:bsc:${chainId}:factory:${factory.toLowerCase()}:live`;
}

export function vaultCursorId(chainId: number, vault: Address): string {
	return `launch:bsc:${chainId}:vault:${vault.toLowerCase()}:live`;
}

export function routerCursorId(chainId: number, router: Address): string {
	return `launch:bsc:${chainId}:router:${router.toLowerCase()}:live`;
}

export function portalCursorId(chainId: number, portal: Address): string {
	return `launch:bsc:${chainId}:portal:${portal.toLowerCase()}:live`;
}

export function flapCursorId(chainId: number, flap: Address): string {
	return `launch:bsc:${chainId}:flap:${flap.toLowerCase()}:live`;
}
