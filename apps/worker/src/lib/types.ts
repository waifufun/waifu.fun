import type { Logger } from "@waifufun/logger";
import type { Job } from "bullmq";

import type { Database, DbClient } from "@waifufun/db";
import type { JobName, QueueKey } from "@waifufun/queue";

export type WorkerDbClient = Database & DbClient;

export interface WorkerPublicClient {
	getBalance?: (input: { address: `0x${string}` }) => Promise<bigint>;
	getBlockNumber?: () => Promise<bigint>;
}

export interface WorkerContext {
	logger: Logger;
	startedAt: Date;
	chainId: number;
	db: WorkerDbClient;
	publicClient?: WorkerPublicClient;
	launchBroadcaster?: (input: {
		agentId: string;
		createArg: `0x${string}`;
		signature: `0x${string}`;
		firstBuyWei: string;
		chainId: number;
	}) => Promise<{ txHash: `0x${string}` }>;
}

export type WorkerProcessor<TResult = unknown> = (job: Job) => Promise<TResult>;

export interface WorkerRegistration<TResult = unknown> {
	jobName: JobName;
	queueKey: QueueKey;
	queueName: string;
	concurrency: number;
	description: string;
	processor: WorkerProcessor<TResult>;
}
