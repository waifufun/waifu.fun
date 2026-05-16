import { z } from "zod";

import {
	DEFAULT_CHAIN_ID,
	hexAddressSchema,
	hexDataSchema,
	isoDateTimeSchema,
	supportedChainIdSchema,
} from "./common.js";
import { launchTokenTypeSchema } from "./launch.js";
import { flapTokenMetadataSchema } from "./token.js";

export const queueNameSchema = z.enum(["launch", "metadata", "salt", "index", "cache", "notify", "reconcile"]);
export type QueueName = z.infer<typeof queueNameSchema>;

export const jobStatusSchema = z.enum(["pending", "running", "completed", "failed", "retrying", "dead"]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const warmListTypeSchema = z.enum(["trending", "new", "featured"]);
export type WarmListType = z.infer<typeof warmListTypeSchema>;

export const notifyTypeSchema = z.enum(["launch_approved", "token_migrated", "trade_alert"]);
export type NotifyType = z.infer<typeof notifyTypeSchema>;

export const launchPrepJobSchema = z.object({
	launchId: z.string().min(1),
});
export type LaunchPrepJob = z.infer<typeof launchPrepJobSchema>;

export const launchExecuteJobSchema = z.object({
	launchId: z.string().min(1),
	preparedPayload: hexDataSchema,
});
export type LaunchExecuteJob = z.infer<typeof launchExecuteJobSchema>;

export const metadataUploadJobSchema = z.object({
	launchId: z.string().min(1),
	metadata: flapTokenMetadataSchema,
	attempt: z.number().int().nonnegative().default(0),
});
export type MetadataUploadJob = z.infer<typeof metadataUploadJobSchema>;

export const metadataRetryJobSchema = z.object({
	launchId: z.string().min(1),
	reason: z.string().min(1),
});
export type MetadataRetryJob = z.infer<typeof metadataRetryJobSchema>;

export const saltSearchJobSchema = z.object({
	launchId: z.string().min(1),
	tokenType: launchTokenTypeSchema,
	suffix: z.string().trim().min(1),
});
export type SaltSearchJob = z.infer<typeof saltSearchJobSchema>;

export const backfillJobSchema = z.object({
	fromBlock: z.coerce.bigint().refine((value) => value >= 0n, {
		message: "Expected fromBlock to be non-negative",
	}),
	toBlock: z.coerce.bigint().refine((value) => value >= 0n, {
		message: "Expected toBlock to be non-negative",
	}),
});
export type BackfillJob = z.infer<typeof backfillJobSchema>;

export const reindexTokenJobSchema = z.object({
	chainId: supportedChainIdSchema.default(DEFAULT_CHAIN_ID),
	tokenAddress: hexAddressSchema,
});
export type ReindexTokenJob = z.infer<typeof reindexTokenJobSchema>;

export const recalcProgressJobSchema = z.object({
	chainId: supportedChainIdSchema.default(DEFAULT_CHAIN_ID),
	tokenAddress: hexAddressSchema,
});
export type RecalcProgressJob = z.infer<typeof recalcProgressJobSchema>;

export const warmTokenCacheJobSchema = z.object({
	chainId: supportedChainIdSchema.default(DEFAULT_CHAIN_ID),
	tokenAddress: hexAddressSchema,
});
export type WarmTokenCacheJob = z.infer<typeof warmTokenCacheJobSchema>;

export const warmListCacheJobSchema = z.object({
	listType: warmListTypeSchema,
});
export type WarmListCacheJob = z.infer<typeof warmListCacheJobSchema>;

export const notifyJobSchema = z.object({
	type: notifyTypeSchema,
	payload: z.record(z.unknown()),
});
export type NotifyJob = z.infer<typeof notifyJobSchema>;

export const reconcileTokenJobSchema = z.object({
	chainId: supportedChainIdSchema.default(DEFAULT_CHAIN_ID),
	tokenAddress: hexAddressSchema,
});
export type ReconcileTokenJob = z.infer<typeof reconcileTokenJobSchema>;

export const fullReconcileJobSchema = z.object({
	batchSize: z.number().int().positive(),
});
export type FullReconcileJob = z.infer<typeof fullReconcileJobSchema>;

export const jobEnvelopeSchema = z.discriminatedUnion("name", [
	z.object({
		queue: z.literal("launch"),
		name: z.literal("launch.prep"),
		payload: launchPrepJobSchema,
	}),
	z.object({
		queue: z.literal("launch"),
		name: z.literal("launch.execute"),
		payload: launchExecuteJobSchema,
	}),
	z.object({
		queue: z.literal("metadata"),
		name: z.literal("metadata.upload"),
		payload: metadataUploadJobSchema,
	}),
	z.object({
		queue: z.literal("metadata"),
		name: z.literal("metadata.retry"),
		payload: metadataRetryJobSchema,
	}),
	z.object({
		queue: z.literal("salt"),
		name: z.literal("salt.search"),
		payload: saltSearchJobSchema,
	}),
	z.object({
		queue: z.literal("index"),
		name: z.literal("index.backfill"),
		payload: backfillJobSchema,
	}),
	z.object({
		queue: z.literal("index"),
		name: z.literal("index.reindex_token"),
		payload: reindexTokenJobSchema,
	}),
	z.object({
		queue: z.literal("index"),
		name: z.literal("index.recalc_progress"),
		payload: recalcProgressJobSchema,
	}),
	z.object({
		queue: z.literal("cache"),
		name: z.literal("cache.warm_token"),
		payload: warmTokenCacheJobSchema,
	}),
	z.object({
		queue: z.literal("cache"),
		name: z.literal("cache.warm_list"),
		payload: warmListCacheJobSchema,
	}),
	z.object({
		queue: z.literal("notify"),
		name: z.literal("notify.dispatch"),
		payload: notifyJobSchema,
	}),
	z.object({
		queue: z.literal("reconcile"),
		name: z.literal("reconcile.token"),
		payload: reconcileTokenJobSchema,
	}),
	z.object({
		queue: z.literal("reconcile"),
		name: z.literal("reconcile.full"),
		payload: fullReconcileJobSchema,
	}),
]);
export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export const jobLedgerEntrySchema = z.object({
	id: z.string().min(1),
	queue: queueNameSchema,
	jobName: z.string().min(1),
	status: jobStatusSchema,
	attempts: z.number().int().nonnegative(),
	payload: z.unknown(),
	result: z.unknown().nullable().optional().default(null),
	referenceType: z.string().nullable().optional().default(null),
	referenceId: z.string().nullable().optional().default(null),
	createdAt: isoDateTimeSchema,
	completedAt: isoDateTimeSchema.nullable().optional().default(null),
});
export type JobLedgerEntry = z.infer<typeof jobLedgerEntrySchema>;
