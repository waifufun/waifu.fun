import type { Logger } from "@waifufun/logger";

import {
	addAgentRollupJob,
	addCacheWarmJob,
	addReconciliationJob,
	addReindexJob,
	addXTokenRefreshJob,
} from "@waifufun/queue";

interface WorkerScheduleRegistration {
	id: string;
	description: string;
	register: () => Promise<unknown>;
}

function createWorkerScheduleRegistrations(chainId: number): WorkerScheduleRegistration[] {
	return [
		{
			id: "schedule:cache-warm:trending",
			description: "Refresh the trending token list cache every five minutes.",
			register: () =>
				addCacheWarmJob(
					{ target: "list", listType: "trending", reason: "scheduler" },
					{ jobId: "schedule:cache-warm:trending", repeat: { pattern: "*/5 * * * *" } },
				),
		},
		{
			id: "schedule:cache-warm:new",
			description: "Refresh the newly created token list cache every five minutes.",
			register: () =>
				addCacheWarmJob(
					{ target: "list", listType: "new", reason: "scheduler" },
					{ jobId: "schedule:cache-warm:new", repeat: { pattern: "*/5 * * * *" } },
				),
		},
		{
			id: "schedule:cache-warm:featured",
			description: "Refresh the featured token list cache every ten minutes.",
			register: () =>
				addCacheWarmJob(
					{ target: "list", listType: "featured", reason: "scheduler" },
					{ jobId: "schedule:cache-warm:featured", repeat: { pattern: "*/10 * * * *" } },
				),
		},
		{
			id: "schedule:reconciliation:full",
			description: "Run a broad async consistency sweep every fifteen minutes.",
			register: () =>
				addReconciliationJob(
					{ scope: "full", chainId, batchSize: 250 },
					{ jobId: "schedule:reconciliation:full", repeat: { pattern: "*/15 * * * *" } },
				),
		},
		{
			id: "schedule:reindex:full-backfill",
			description: "Schedule an hourly gap-fill pass for the indexer.",
			register: () =>
				addReindexJob(
					{ scope: "full-backfill", chainId, reason: "scheduled-hourly-gap-fill" },
					{ jobId: "schedule:reindex:full-backfill", repeat: { pattern: "0 * * * *" } },
				),
		},
		{
			id: "schedule:x-token-refresh",
			description: "Refresh per-agent X OAuth tokens every thirty minutes.",
			register: () =>
				addXTokenRefreshJob(
					{ reason: "scheduled-30m-refresh", limit: 100 },
					{ jobId: "schedule:x-token-refresh", repeat: { pattern: "*/30 * * * *" } },
				),
		},
		{
			id: "schedule:agent-rollup",
			description: "Refresh per-agent treasury, burn, and runway metrics every five minutes.",
			register: () =>
				addAgentRollupJob(
					{ reason: "scheduled-5m-rollup", limit: 500 },
					{ jobId: "schedule:agent-rollup", repeat: { pattern: "*/5 * * * *" } },
				),
		},
	];
}

export async function ensureWorkerSchedules(logger: Logger): Promise<void> {
	const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);
	const registrations = createWorkerScheduleRegistrations(chainId);

	await Promise.all(registrations.map((registration) => registration.register()));

	logger.info(
		{
			schedules: registrations.map(({ id, description }) => ({ id, description })),
		},
		"registered repeatable worker schedules",
	);
}
