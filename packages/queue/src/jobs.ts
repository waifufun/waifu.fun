import { z } from "zod";

import type { QueueKey } from "./catalog.js";

const defaultChainId = 56;

const chainIdSchema = z.number().int().positive().default(defaultChainId);
const launchIdSchema = z.string().min(1);

export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Expected a 0x-prefixed 20-byte EVM address");

export const hexSchema = z.string().regex(/^0x([a-fA-F0-9]{2})*$/, "Expected a 0x-prefixed hex string");

// This is the product-facing launch metadata shape before it is transformed into
// Flap's pinned metadata JSON. The upload worker will eventually map this into the
// exact GraphQL upload + IPFS payload expected by packages/flap.
export const tokenMetadataSchema = z.object({
	name: z.string().min(1).max(64),
	symbol: z.string().min(1).max(16),
	description: z.string().max(4000).default(""),
	imageUrl: z.string().min(1),
	website: z.string().url().nullable().optional(),
	twitter: z.string().url().nullable().optional(),
	telegram: z.string().url().nullable().optional(),
	buy: z.string().url().nullable().optional(),
	sell: z.string().url().nullable().optional(),
});

export const launchPrepJobSchema = z.object({
	launchId: launchIdSchema,
	creatorAddress: addressSchema,
	chainId: chainIdSchema,
	portalAddress: addressSchema.optional(),
	quoteToken: addressSchema.nullable().optional(),
	quoteAmount: z.string().optional(),
	taxRate: z.number().int().min(0).max(10_000).default(0),
	metadata: tokenMetadataSchema,
	requestSource: z.enum(["api", "admin", "scheduler"]).default("api"),
});

export const metadataUploadJobSchema = z.object({
	launchId: launchIdSchema,
	creatorAddress: addressSchema,
	metadata: tokenMetadataSchema,
	attempt: z.number().int().min(0).default(0),
});

export const saltSearchJobSchema = z.object({
	launchId: launchIdSchema,
	chainId: chainIdSchema,
	tokenType: z.enum(["standard", "tax"]),
	suffix: z.string().min(1).max(8).optional(),
	portalAddress: addressSchema.optional(),
	implementationAddress: addressSchema.optional(),
	seedSalt: hexSchema.optional(),
});

export const reindexJobSchema = z.discriminatedUnion("scope", [
	z.object({
		scope: z.literal("token"),
		tokenAddress: addressSchema,
		chainId: chainIdSchema,
		reason: z.string().min(1).default("manual-token-reindex"),
	}),
	z.object({
		scope: z.literal("block-range"),
		chainId: chainIdSchema,
		fromBlock: z.coerce.bigint().nonnegative(),
		toBlock: z.coerce.bigint().nonnegative(),
		reason: z.string().min(1).default("manual-block-range-reindex"),
	}),
	z.object({
		scope: z.literal("full-backfill"),
		chainId: chainIdSchema,
		fromBlock: z.coerce.bigint().nonnegative().optional(),
		toBlock: z.coerce.bigint().nonnegative().optional(),
		reason: z.string().min(1).default("scheduled-full-backfill"),
	}),
]);

export const cacheWarmJobSchema = z.discriminatedUnion("target", [
	z.object({
		target: z.literal("token"),
		tokenAddress: addressSchema,
		reason: z.string().min(1).optional(),
	}),
	z.object({
		target: z.literal("list"),
		listType: z.enum(["trending", "new", "featured"]),
		reason: z.string().min(1).optional(),
	}),
	z.object({
		target: z.literal("launch"),
		launchId: launchIdSchema,
		reason: z.string().min(1).optional(),
	}),
]);

export const notificationTypeSchema = z.enum([
	"launch_preparing",
	"launch_ready",
	"token_created",
	"token_migrated",
	"progress_milestone",
	"reconciliation_alert",
	"generic",
]);

export const notificationJobSchema = z.object({
	type: notificationTypeSchema,
	audience: z.enum(["creator", "admin", "public", "internal"]).default("internal"),
	channel: z.enum(["internal", "discord", "webhook"]).default("internal"),
	referenceId: z.string().optional(),
	payload: z.record(z.string(), z.unknown()).default({}),
});

export const xTokenRefreshJobSchema = z.object({
	reason: z.string().min(1).default("scheduled-30m-refresh"),
	limit: z.number().int().positive().max(500).default(100),
});

export const agentProvisioningJobSchema = z.object({
	agentId: z.string().min(1),
	data: z.record(z.string(), z.unknown()).default({}),
	source: z
		.enum([
			"agent.claimed",
			"agent.launched",
			"agent.graduated",
			"token.migrated",
			"agent.provisioning_failed",
			"manual",
		])
		.default("agent.provisioning_failed"),
});

export const agentRollupJobSchema = z.object({
	reason: z.string().min(1).default("scheduled-5m-rollup"),
	limit: z.number().int().positive().max(1000).default(500),
});

export const reconciliationJobSchema = z.discriminatedUnion("scope", [
	z.object({
		scope: z.literal("token"),
		chainId: chainIdSchema,
		tokenAddress: addressSchema,
		expectedProgressBps: z.number().int().min(0).max(10_000).optional(),
	}),
	z.object({
		scope: z.literal("indexer"),
		chainId: chainIdSchema,
		fromBlock: z.coerce.bigint().nonnegative().optional(),
		toBlock: z.coerce.bigint().nonnegative().optional(),
	}),
	z.object({
		scope: z.literal("full"),
		chainId: chainIdSchema,
		batchSize: z.number().int().positive().default(250),
	}),
]);

export const jobSchemas = {
	"launch-prep": launchPrepJobSchema,
	"metadata-upload": metadataUploadJobSchema,
	"salt-search": saltSearchJobSchema,
	reindex: reindexJobSchema,
	"cache-warm": cacheWarmJobSchema,
	notification: notificationJobSchema,
	reconciliation: reconciliationJobSchema,
	"x-token-refresh": xTokenRefreshJobSchema,
	"agent-provisioning": agentProvisioningJobSchema,
	"agent-rollup": agentRollupJobSchema,
} as const;

export type Address = z.infer<typeof addressSchema>;
export type Hex = z.infer<typeof hexSchema>;
export type TokenMetadata = z.infer<typeof tokenMetadataSchema>;
export type LaunchPrepJob = z.infer<typeof launchPrepJobSchema>;
export type MetadataUploadJob = z.infer<typeof metadataUploadJobSchema>;
export type SaltSearchJob = z.infer<typeof saltSearchJobSchema>;
export type ReindexJob = z.infer<typeof reindexJobSchema>;
export type CacheWarmJob = z.infer<typeof cacheWarmJobSchema>;
export type NotificationJob = z.infer<typeof notificationJobSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type ReconciliationJob = z.infer<typeof reconciliationJobSchema>;
export type XTokenRefreshJob = z.infer<typeof xTokenRefreshJobSchema>;
export type AgentProvisioningJob = z.infer<typeof agentProvisioningJobSchema>;
export type AgentRollupJob = z.infer<typeof agentRollupJobSchema>;
export type JobName = keyof typeof jobSchemas;

export interface JobPayloadMap {
	"launch-prep": LaunchPrepJob;
	"metadata-upload": MetadataUploadJob;
	"salt-search": SaltSearchJob;
	reindex: ReindexJob;
	"cache-warm": CacheWarmJob;
	notification: NotificationJob;
	reconciliation: ReconciliationJob;
	"x-token-refresh": XTokenRefreshJob;
	"agent-provisioning": AgentProvisioningJob;
	"agent-rollup": AgentRollupJob;
}

export interface JobDefinition<TQueueKey extends QueueKey = QueueKey, TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
	jobName: JobName;
	queueKey: TQueueKey;
	schema: TSchema;
	description: string;
}

export const jobDefinitions = {
	"launch-prep": {
		jobName: "launch-prep",
		queueKey: "launch",
		schema: launchPrepJobSchema,
		description: "Prepare a launch by fanning out metadata upload, salt search, and notifications.",
	},
	"metadata-upload": {
		jobName: "metadata-upload",
		queueKey: "metadata",
		schema: metadataUploadJobSchema,
		description: "Upload validated metadata through the Flap upload pipeline.",
	},
	"salt-search": {
		jobName: "salt-search",
		queueKey: "salt",
		schema: saltSearchJobSchema,
		description: "Find or verify a vanity CREATE2 salt for the launch token address.",
	},
	reindex: {
		jobName: "reindex",
		queueKey: "index",
		schema: reindexJobSchema,
		description: "Request indexer repair work across a token, block range, or full gap-fill span.",
	},
	"cache-warm": {
		jobName: "cache-warm",
		queueKey: "cache",
		schema: cacheWarmJobSchema,
		description: "Refresh derived cache entries after product-visible state changes.",
	},
	notification: {
		jobName: "notification",
		queueKey: "notify",
		schema: notificationJobSchema,
		description: "Dispatch product notifications to internal or external channels.",
	},
	reconciliation: {
		jobName: "reconciliation",
		queueKey: "reconcile",
		schema: reconciliationJobSchema,
		description: "Compare indexed state with expected on-chain or materialized state.",
	},
	"x-token-refresh": {
		jobName: "x-token-refresh",
		queueKey: "reconcile",
		schema: xTokenRefreshJobSchema,
		description: "Refresh expiring per-agent X OAuth tokens.",
	},
	"agent-provisioning": {
		jobName: "agent-provisioning",
		queueKey: "provisioning",
		schema: agentProvisioningJobSchema,
		description: "Provision Eliza Cloud containers for claimed, graduated, or migrated agents.",
	},
	"agent-rollup": {
		jobName: "agent-rollup",
		queueKey: "reconcile",
		schema: agentRollupJobSchema,
		description: "Roll up per-agent treasury, burn, and runway metrics.",
	},
} as const satisfies Record<JobName, JobDefinition>;

export const jobNames = Object.keys(jobDefinitions) as JobName[];

export function parseJobPayload<TJobName extends JobName>(
	jobName: TJobName,
	payload: unknown,
): JobPayloadMap[TJobName] {
	return jobDefinitions[jobName].schema.parse(payload) as JobPayloadMap[TJobName];
}

export function getQueueKeyForJob(jobName: JobName): QueueKey {
	return jobDefinitions[jobName].queueKey;
}
