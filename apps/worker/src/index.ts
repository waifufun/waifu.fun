import { Worker } from "bullmq";

import { createDbRepository, getDatabase } from "@waifufun/db";
import { closeRedisConnection, createRedisConnection } from "@waifufun/queue";

import { logger } from "./lib/logger.js";
import { startMetricsServer } from "./lib/metrics-server.js";
import { ensureWorkerSchedules } from "./lib/schedules.js";
import type { WorkerContext, WorkerRegistration } from "./lib/types.js";
import { createWorkerRegistrations } from "./processors/index.js";

interface BootedWorker {
	registration: WorkerRegistration;
	worker: Worker;
}

const workers: BootedWorker[] = [];
let metricsServer: ReturnType<typeof startMetricsServer> | undefined;

async function bootWorkers(context: WorkerContext): Promise<void> {
	const registrations = createWorkerRegistrations(context);

	for (const registration of registrations) {
		const worker = new Worker(
			registration.queueName,
			async (job) => {
				if (job.name !== registration.jobName) {
					throw new Error(
						`Worker for ${registration.jobName} received unexpected job ${job.name} on ${registration.queueName}`,
					);
				}

				return registration.processor(job);
			},
			{
				connection: createRedisConnection({
					connectionName: `waifu-worker:${registration.jobName}`,
				}),
				concurrency: registration.concurrency,
			},
		);

		worker.on("completed", (job, result) => {
			logger.info(
				{
					queueName: registration.queueName,
					jobName: job.name,
					jobId: job.id,
					result,
				},
				"worker job completed",
			);
		});

		worker.on("failed", (job, error) => {
			logger.error(
				{
					queueName: registration.queueName,
					expectedJobName: registration.jobName,
					jobName: job?.name,
					jobId: job?.id,
					error: error.message,
				},
				"worker job failed",
			);
		});

		workers.push({ registration, worker });
	}

	logger.info(
		{
			workerCount: workers.length,
			workers: workers.map(({ registration }) => ({
				jobName: registration.jobName,
				queueName: registration.queueName,
				concurrency: registration.concurrency,
			})),
		},
		"waifu worker booted",
	);
}

async function main(): Promise<void> {
	const database = getDatabase();
	const context: WorkerContext = {
		logger,
		startedAt: new Date(),
		chainId: Number(process.env.BSC_CHAIN_ID ?? 56),
		db: Object.assign(database.db, createDbRepository(database.db)),
	};

	metricsServer = startMetricsServer(logger);
	await ensureWorkerSchedules(logger);
	await bootWorkers(context);
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
	logger.info({ signal }, "shutting down worker");

	await Promise.allSettled(
		[
			...workers.map(({ worker }) => worker.close()),
			metricsServer ? new Promise<void>((resolve) => metricsServer?.close(() => resolve())) : undefined,
		].filter((item): item is Promise<void> => item !== undefined),
	);
	await closeRedisConnection();
	process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		void shutdown(signal);
	});
}

void main().catch(async (error: unknown) => {
	logger.error({ error }, "worker boot failed");
	await Promise.allSettled(workers.map(({ worker }) => worker.close()));
	await closeRedisConnection();
	process.exit(1);
});
