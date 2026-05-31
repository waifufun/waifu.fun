import type { Job } from "bullmq";

import { type ReindexJob, parseJobPayload } from "@waifufun/queue/jobs";

import { emitAgentEvent } from "../lib/emit.js";
import type { WorkerContext } from "../lib/types.js";

export function createReindexProcessor(context: WorkerContext) {
	return async (job: Job<ReindexJob>) => {
		const payload = parseJobPayload("reindex", job.data);

		context.logger.info({ jobId: job.id, scope: payload.scope, chainId: payload.chainId }, "reindex starting");

		try {
			await emitAgentEvent({
				eventType: "system.reindex_triggered",
				agentId: null,
				db: context.db,
				data: serializeReindexPayload(payload),
			});

			if (payload.scope === "token") {
				const token = await context.db.getTokenByAddress(payload.tokenAddress);
				const { addCacheWarmJob } = await import("@waifufun/queue");
				await addCacheWarmJob(
					{ target: "token", tokenAddress: payload.tokenAddress, reason: "post-reindex" },
					{ jobId: `reindex:${payload.tokenAddress}:cache-warm` },
				);
				return {
					status: "requested",
					scope: payload.scope,
					tokenAddress: payload.tokenAddress,
					chainId: payload.chainId,
					reason: payload.reason,
					found: !!token,
				};
			}

			if (payload.scope === "block-range") {
				return {
					status: "requested",
					scope: payload.scope,
					chainId: payload.chainId,
					fromBlock: payload.fromBlock.toString(),
					toBlock: payload.toBlock.toString(),
					reason: payload.reason,
				};
			}

			if (payload.scope === "full-backfill") {
				return {
					status: "requested",
					scope: payload.scope,
					chainId: payload.chainId,
					fromBlock: payload.fromBlock?.toString() ?? null,
					toBlock: payload.toBlock?.toString() ?? null,
					reason: payload.reason,
				};
			}

			const _exhaustiveCheck: never = payload;
			throw new Error(`Unknown reindex scope: ${(_exhaustiveCheck as any).scope}`);
		} catch (error) {
			context.logger.error(
				{
					jobId: job.id,
					scope: job.data.scope,
					error: error instanceof Error ? error.message : String(error),
				},
				"reindex failed",
			);
			throw error;
		}
	};
}

function serializeReindexPayload(payload: ReindexJob): Record<string, unknown> {
	return JSON.parse(
		JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
	) as Record<string, unknown>;
}
