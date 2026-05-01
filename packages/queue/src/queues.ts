import { type JobsOptions, Queue } from "bullmq";

import {
	type QueueKey,
	getQueueDefinition,
	queueDefinitions,
	queueKeys,
	queueNames,
	workerConcurrency,
} from "./catalog.js";
import { getRedisUrl } from "./connection.js";
import {
	type AgentProvisioningJob,
	type AgentRollupJob,
	type CacheWarmJob,
	type JobName,
	type JobPayloadMap,
	type LaunchPrepJob,
	type MetadataUploadJob,
	type NotificationJob,
	type ReconciliationJob,
	type ReindexJob,
	type SaltSearchJob,
	type XTokenRefreshJob,
	getQueueKeyForJob,
	jobDefinitions,
	jobNames,
	parseJobPayload,
} from "./jobs.js";

export const defaultJobOptions: JobsOptions = {
	attempts: 3,
	removeOnComplete: 100,
	removeOnFail: 1000,
	backoff: {
		type: "exponential",
		delay: 5_000,
	},
};

function createQueue(queueKey: QueueKey): Queue {
	const definition = getQueueDefinition(queueKey);

	return new Queue(definition.redisName, {
		connection: {
			url: getRedisUrl(),
			maxRetriesPerRequest: null,
			enableReadyCheck: false,
			lazyConnect: false,
			connectionName: `waifu:queue:${definition.redisName}`,
		},
		defaultJobOptions,
	});
}

export const launchQueue = createQueue("launch");
export const metadataQueue = createQueue("metadata");
export const saltQueue = createQueue("salt");
export const indexQueue = createQueue("index");
export const cacheQueue = createQueue("cache");
export const notifyQueue = createQueue("notify");
export const reconcileQueue = createQueue("reconcile");
export const provisioningQueue = createQueue("provisioning");

export const queues = {
	launch: launchQueue,
	metadata: metadataQueue,
	salt: saltQueue,
	index: indexQueue,
	cache: cacheQueue,
	notify: notifyQueue,
	reconcile: reconcileQueue,
	provisioning: provisioningQueue,
} as const;

export const queueCatalog = jobNames.map((jobName) => {
	const jobDefinition = jobDefinitions[jobName];
	const queueDefinition = queueDefinitions[jobDefinition.queueKey];

	return {
		jobName,
		queueKey: jobDefinition.queueKey,
		queueName: queueDefinition.redisName,
		ledgerQueue: queueDefinition.ledgerName,
		concurrency: queueDefinition.concurrency,
		description: jobDefinition.description,
	};
});

export function getQueue(queueKey: QueueKey): Queue {
	return queues[queueKey];
}

export function getQueueForJob(jobName: JobName): Queue {
	return getQueue(getQueueKeyForJob(jobName));
}

export function getAllQueues(): Queue[] {
	return queueKeys.map((queueKey) => getQueue(queueKey));
}

export function enqueueJob<TJobName extends JobName>(
	jobName: TJobName,
	payload: JobPayloadMap[TJobName],
	options?: JobsOptions,
) {
	return getQueueForJob(jobName).add(jobName, parseJobPayload(jobName, payload), options);
}

export function addLaunchPrepJob(payload: LaunchPrepJob, options?: JobsOptions) {
	return enqueueJob("launch-prep", payload, options);
}

export function addMetadataUploadJob(payload: MetadataUploadJob, options?: JobsOptions) {
	return enqueueJob("metadata-upload", payload, options);
}

export function addSaltSearchJob(payload: SaltSearchJob, options?: JobsOptions) {
	return enqueueJob("salt-search", payload, options);
}

export function addReindexJob(payload: ReindexJob, options?: JobsOptions) {
	return enqueueJob("reindex", payload, options);
}

export function addCacheWarmJob(payload: CacheWarmJob, options?: JobsOptions) {
	return enqueueJob("cache-warm", payload, options);
}

export function addNotificationJob(payload: NotificationJob, options?: JobsOptions) {
	return enqueueJob("notification", payload, options);
}

export function addReconciliationJob(payload: ReconciliationJob, options?: JobsOptions) {
	return enqueueJob("reconciliation", payload, options);
}

export function addXTokenRefreshJob(payload: XTokenRefreshJob, options?: JobsOptions) {
	return enqueueJob("x-token-refresh", payload, options);
}

export function addAgentProvisioningJob(payload: AgentProvisioningJob, options?: JobsOptions) {
	return enqueueJob("agent-provisioning", payload, options);
}

export function addAgentRollupJob(payload: AgentRollupJob, options?: JobsOptions) {
	return enqueueJob("agent-rollup", payload, options);
}

export { queueDefinitions, queueKeys, queueNames, workerConcurrency };
