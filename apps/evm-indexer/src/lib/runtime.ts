import { type Database, getDatabase } from "@waifufun/db";
import type { Logger } from "@waifufun/logger";
import type { AgentProvisioningJob, CacheWarmJob, NotificationJob } from "@waifufun/queue/jobs";
import { http, type Address, type Chain, type PublicClient, type Transport, createPublicClient } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import { type CursorStore, DrizzleCursorStore } from "./cursor-store.js";
import { logger } from "./logger.js";
import { type PortalEventSource, createPortalEventSource } from "./source.js";
import { type WebhookDispatcher, createWebhookDispatcher } from "./webhooks.js";

export interface PortalIndexerConfig {
	chainId: number;
	portalAddress: Address;
	rpcUrl: string;
	startBlock: bigint;
	livePollIntervalMs: number;
	liveMaxBlocksPerPoll: bigint;
	backfillChunkSize: bigint;
	backfillTargetBlock: bigint;
}

export interface IndexerCursorIds {
	live: string;
	backfill: string;
}

export interface IndexerRuntime {
	db: Database;
	logger: Logger;
	publicClient: PublicClient<Transport, Chain>;
	cursors: CursorStore;
	source: PortalEventSource;
	webhooks: WebhookDispatcher;
	config: PortalIndexerConfig;
	cursorIds: IndexerCursorIds;
	enqueueAgentProvisioning?: (payload: AgentProvisioningJob, options?: { jobId?: string }) => Promise<unknown>;
	enqueueCacheWarm?: (payload: CacheWarmJob, options?: { jobId?: string }) => Promise<unknown>;
	enqueueNotification?: (payload: NotificationJob, options?: { jobId?: string }) => Promise<unknown>;
}

export function getBscChain(chainId: number): Chain {
	return chainId === 97 ? bscTestnet : bsc;
}

function createPortalIndexerConfig(): PortalIndexerConfig {
	const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);
	const chain = getBscChain(chainId);
	const portalAddress = (process.env.FLAP_PORTAL_ADDRESS ?? "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0") as Address;
	const startBlock = BigInt(process.env.INDEXER_START_BLOCK ?? "0");

	return {
		chainId,
		portalAddress,
		rpcUrl: process.env.BSC_RPC_URL || chain.rpcUrls.default.http[0]!,
		startBlock,
		livePollIntervalMs: Number(process.env.INDEXER_POLL_INTERVAL ?? 2_000),
		liveMaxBlocksPerPoll: BigInt(process.env.INDEXER_LIVE_MAX_BLOCKS ?? "25"),
		backfillChunkSize: BigInt(process.env.INDEXER_BACKFILL_CHUNK_SIZE ?? "2000"),
		backfillTargetBlock: BigInt(process.env.INDEXER_BACKFILL_TO_BLOCK ?? startBlock.toString()),
	};
}

function createCursorIds(config: PortalIndexerConfig): IndexerCursorIds {
	return {
		live: `flap:bsc:${config.chainId}:portal:live`,
		backfill: `flap:bsc:${config.chainId}:portal:backfill`,
	};
}

export function createIndexerRuntime(): IndexerRuntime {
	const config = createPortalIndexerConfig();
	const { db } = getDatabase();
	const publicClient = createPublicClient({
		chain: getBscChain(config.chainId),
		transport: http(config.rpcUrl),
	});

	return {
		db,
		logger,
		publicClient,
		cursors: new DrizzleCursorStore(db, logger, config.chainId, config.portalAddress),
		source: createPortalEventSource({
			logger,
			chainId: config.chainId,
			portalAddress: config.portalAddress,
		}),
		webhooks: createWebhookDispatcher({ logger }),
		config,
		cursorIds: createCursorIds(config),
	};
}
