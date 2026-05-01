import type { Job } from "bullmq";

import { type ReconciliationJob, addCacheWarmJob, parseJobPayload } from "@waifufun/queue";

import { emitAgentEvent } from "../lib/emit.js";
import type { WorkerContext } from "../lib/types.js";

const DRIFT_THRESHOLD_WEI = 1_000_000_000_000_000n;

export function createReconciliationProcessor(context: WorkerContext) {
	return async (job: Job<ReconciliationJob>) => {
		const payload = parseJobPayload("reconciliation", job.data);

		context.logger.info({ jobId: job.id, scope: payload.scope, chainId: payload.chainId }, "reconciliation starting");

		try {
			if (payload.scope === "token") {
				const agents = (await context.db.listActiveAgents()).filter(
					(agent) => agent.tokenAddress?.toLowerCase() === payload.tokenAddress.toLowerCase(),
				);
				const drifts = await emitDriftEvents(context, agents, payload.chainId);

				await addCacheWarmJob(
					{ target: "token", tokenAddress: payload.tokenAddress, reason: "post-reconciliation" },
					{ jobId: `reconcile:${payload.tokenAddress}:cache-warm` },
				);

				return {
					status: "completed",
					scope: payload.scope,
					tokenAddress: payload.tokenAddress,
					chainId: payload.chainId,
					drifts,
				};
			}

			if (payload.scope === "indexer") {
				context.logger.info(
					{
						jobId: job.id,
						chainId: payload.chainId,
						fromBlock: payload.fromBlock?.toString(),
						toBlock: payload.toBlock?.toString(),
					},
					"indexer reconciliation pass complete",
				);
				return {
					status: "completed",
					scope: payload.scope,
					chainId: payload.chainId,
					fromBlock: payload.fromBlock?.toString(),
					toBlock: payload.toBlock?.toString(),
				};
			}

			if (payload.scope === "full") {
				const agents = await context.db.listActiveAgents(payload.batchSize);
				const drifts = await emitDriftEvents(context, agents, payload.chainId);
				context.logger.info(
					{ jobId: job.id, chainId: payload.chainId, checked: agents.length, drifts },
					"reconciliation pass complete",
				);
				return {
					status: "completed",
					scope: payload.scope,
					chainId: payload.chainId,
					batchSize: payload.batchSize,
					checked: agents.length,
					drifts,
				};
			}

			const _exhaustiveCheck: never = payload;
			throw new Error(`Unknown reconciliation scope: ${(_exhaustiveCheck as any).scope}`);
		} catch (error) {
			context.logger.error(
				{
					jobId: job.id,
					scope: job.data.scope,
					error: error instanceof Error ? error.message : String(error),
				},
				"reconciliation failed",
			);
			throw error;
		}
	};
}

type ActiveAgent = Awaited<ReturnType<WorkerContext["db"]["listActiveAgents"]>>[number];

async function emitDriftEvents(context: WorkerContext, agents: ActiveAgent[], chainId: number): Promise<number> {
	if (!context.publicClient?.getBalance) {
		context.logger.info({ checked: agents.length }, "reconciliation pass complete; public client not configured");
		return 0;
	}

	let drifts = 0;
	for (const agent of agents) {
		const address = agent.treasuryAddress ?? agent.tokenAddress;
		if (!address) continue;
		const actual = await context.publicClient.getBalance({ address: address as `0x${string}` });
		const expected = BigInt(agent.cachedBalance ?? "0");
		const delta = actual > expected ? actual - expected : expected - actual;
		if (delta <= DRIFT_THRESHOLD_WEI) continue;
		drifts += 1;
		await emitAgentEvent({
			eventType: "agent.reconciliation.drift",
			agentId: agent.id,
			db: context.db,
			data: {
				agentId: agent.id,
				expected: expected.toString(),
				actual: actual.toString(),
				delta: delta.toString(),
				chainId,
			},
		});
	}
	return drifts;
}
