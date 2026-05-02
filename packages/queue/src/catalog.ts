export const queueDefinitions = {
	launch: {
		key: "launch",
		redisName: "waifu-launch",
		ledgerName: "launch",
		concurrency: 2,
		description: "Launch orchestration and preparation fan-out.",
	},
	metadata: {
		key: "metadata",
		redisName: "waifu-metadata",
		ledgerName: "metadata",
		concurrency: 3,
		description: "Flap metadata upload and retry work.",
	},
	salt: {
		key: "salt",
		redisName: "waifu-salt",
		ledgerName: "salt",
		concurrency: 1,
		description: "CREATE2 vanity salt grinding and salt validation.",
	},
	index: {
		key: "index",
		redisName: "waifu-index",
		ledgerName: "index",
		concurrency: 2,
		description: "Indexer control-plane jobs such as reindex and gap-fill.",
	},
	cache: {
		key: "cache",
		redisName: "waifu-cache",
		ledgerName: "cache",
		concurrency: 5,
		description: "Short-lived cache warming and invalidation tasks.",
	},
	notify: {
		key: "notify",
		redisName: "waifu-notify",
		ledgerName: "notify",
		concurrency: 5,
		description: "Outbound notification fan-out for internal and external channels.",
	},
	reconcile: {
		key: "reconcile",
		redisName: "waifu-reconcile",
		ledgerName: "reconcile",
		concurrency: 1,
		description: "Periodic consistency checks across indexed and on-chain state.",
	},
	provisioning: {
		key: "provisioning",
		redisName: "agent-provisioning",
		ledgerName: "agent-provisioning",
		concurrency: 1,
		description: "Retry milady-cloud agent provisioning failures.",
	},
} as const;

export type QueueKey = keyof typeof queueDefinitions;

export const queueKeys = Object.keys(queueDefinitions) as QueueKey[];

export const queueNames = {
	launch: queueDefinitions.launch.redisName,
	metadata: queueDefinitions.metadata.redisName,
	salt: queueDefinitions.salt.redisName,
	index: queueDefinitions.index.redisName,
	cache: queueDefinitions.cache.redisName,
	notify: queueDefinitions.notify.redisName,
	reconcile: queueDefinitions.reconcile.redisName,
	provisioning: queueDefinitions.provisioning.redisName,
} as const;

export const workerConcurrency = {
	launch: queueDefinitions.launch.concurrency,
	metadata: queueDefinitions.metadata.concurrency,
	salt: queueDefinitions.salt.concurrency,
	index: queueDefinitions.index.concurrency,
	cache: queueDefinitions.cache.concurrency,
	notify: queueDefinitions.notify.concurrency,
	reconcile: queueDefinitions.reconcile.concurrency,
	provisioning: queueDefinitions.provisioning.concurrency,
} as const;

export function getQueueDefinition(queueKey: QueueKey) {
	return queueDefinitions[queueKey];
}
