import { queueDefinitions } from "@waifufun/queue/catalog";
import { type JobName, jobDefinitions } from "@waifufun/queue/jobs";

import type { WorkerContext, WorkerProcessor, WorkerRegistration } from "../lib/types.js";
import { createAgentProvisioningProcessor } from "./agent-provisioning.js";
import { createAgentRollupProcessor } from "./agent-rollup.js";
import { createCacheWarmProcessor } from "./cache-warm.js";
import { createLaunchPrepProcessor } from "./launch-prep.js";
import { createMetadataUploadProcessor } from "./metadata-upload.js";
import { createNotificationProcessor } from "./notification.js";
import { createReconciliationProcessor } from "./reconciliation.js";
import { createReindexProcessor } from "./reindex.js";
import { createSaltSearchProcessor } from "./salt-search.js";
import { createXTokenRefreshProcessor } from "./x-token-refresh.js";

function createWorkerRegistration(jobName: JobName, processor: WorkerProcessor): WorkerRegistration {
	const jobDefinition = jobDefinitions[jobName];
	const queueDefinition = queueDefinitions[jobDefinition.queueKey];

	return {
		jobName,
		queueKey: jobDefinition.queueKey,
		queueName: queueDefinition.redisName,
		concurrency: resolveConcurrency(jobName, queueDefinition.concurrency),
		description: jobDefinition.description,
		processor,
	};
}

/**
 * Provisioning runs serially (concurrency 1) by default so two same-agent jobs
 * can never race a duplicate Eliza Cloud create. Operators can raise it via
 * WAIFU_PROVISIONING_CONCURRENCY to parallelize launch bursts — safe because
 * Eliza Cloud is the source of truth per token and the worker adopts 409
 * "already exists" responses instead of creating a second runtime.
 */
function resolveConcurrency(jobName: JobName, fallback: number): number {
	if (jobName !== "agent-provisioning") return fallback;
	const raw = process.env.WAIFU_PROVISIONING_CONCURRENCY?.trim();
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createWorkerRegistrations(context: WorkerContext): WorkerRegistration[] {
	return [
		createWorkerRegistration("launch-prep", createLaunchPrepProcessor(context)),
		createWorkerRegistration("metadata-upload", createMetadataUploadProcessor(context)),
		createWorkerRegistration("salt-search", createSaltSearchProcessor(context)),
		createWorkerRegistration("reindex", createReindexProcessor(context)),
		createWorkerRegistration("cache-warm", createCacheWarmProcessor(context)),
		createWorkerRegistration("notification", createNotificationProcessor(context)),
		createWorkerRegistration("reconciliation", createReconciliationProcessor(context)),
		createWorkerRegistration("x-token-refresh", createXTokenRefreshProcessor(context)),
		createWorkerRegistration("agent-provisioning", createAgentProvisioningProcessor(context)),
		createWorkerRegistration("agent-rollup", createAgentRollupProcessor(context)),
	];
}
