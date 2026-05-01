import { type JobName, jobDefinitions, queueDefinitions } from "@waifufun/queue";

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
		concurrency: queueDefinition.concurrency,
		description: jobDefinition.description,
		processor,
	};
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
