import type { Job } from "bullmq";

import { type CacheWarmJob, parseJobPayload } from "@waifufun/queue/jobs";

import { emitAgentEvent } from "../lib/emit.js";
import type { WorkerContext } from "../lib/types.js";

const CACHE_TTL_SECONDS = { token: 60, list: 30, launch: 120 } as const;

export function createCacheWarmProcessor(context: WorkerContext) {
	return async (job: Job<CacheWarmJob>) => {
		const payload = parseJobPayload("cache-warm", job.data);

		context.logger.info({ jobId: job.id, target: payload.target }, "cache warm starting");

		try {
			if (payload.target === "token") {
				const agent = (await context.db.listTopAgentsByTreasury(25)).find(
					(item) => item.tokenAddress?.toLowerCase() === payload.tokenAddress.toLowerCase(),
				);
				await emitCacheWarmed(context, payload.target, {
					tokenAddress: payload.tokenAddress,
					agentId: agent?.id ?? null,
					reason: payload.reason,
				});
				return {
					status: "completed",
					target: payload.target,
					cacheKey: `cache:token:${payload.tokenAddress}`,
					ttl: CACHE_TTL_SECONDS.token,
					tokenAddress: payload.tokenAddress,
					agentId: agent?.id ?? null,
					reason: payload.reason,
				};
			}

			if (payload.target === "list") {
				const agents = await context.db.listTopAgentsByTreasury(25);
				await Promise.all(agents.map((agent) => prefetchAgentDetail(context, agent.id)));
				await emitCacheWarmed(context, payload.target, {
					listType: payload.listType,
					count: agents.length,
					reason: payload.reason,
				});
				return {
					status: "completed",
					target: payload.target,
					cacheKey: `cache:list:${payload.listType}`,
					ttl: CACHE_TTL_SECONDS.list,
					listType: payload.listType,
					count: agents.length,
					reason: payload.reason,
				};
			}

			if (payload.target === "launch") {
				const launch = await context.db.getLaunchById(payload.launchId);
				await emitCacheWarmed(context, payload.target, {
					launchId: payload.launchId,
					found: !!launch,
					reason: payload.reason,
				});
				return {
					status: "completed",
					target: payload.target,
					cacheKey: `cache:launch:${payload.launchId}`,
					ttl: CACHE_TTL_SECONDS.launch,
					launchId: payload.launchId,
					found: !!launch,
					reason: payload.reason,
				};
			}

			const _exhaustiveCheck: never = payload;
			throw new Error(`Unknown cache warm target: ${(_exhaustiveCheck as any).target}`);
		} catch (error) {
			context.logger.error(
				{
					jobId: job.id,
					target: job.data.target,
					error: error instanceof Error ? error.message : String(error),
				},
				"cache warm failed",
			);
			throw error;
		}
	};
}

async function prefetchAgentDetail(context: WorkerContext, agentId: string) {
	return context.db.getWaifuById(agentId);
}

async function emitCacheWarmed(context: WorkerContext, target: CacheWarmJob["target"], data: Record<string, unknown>) {
	await emitAgentEvent({
		eventType: "system.cache_warmed",
		agentId: null,
		data: { target, ...data },
		db: context.db,
	});
}
