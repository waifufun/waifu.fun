import { agentEventQueries, schema } from "@waifufun/db";
import type { AgentProvisioningJob } from "@waifufun/queue/jobs";
import { eq, sql } from "drizzle-orm";

import type { FlapLaunchedToDexEvent, PortalTokenCreatedEvent } from "../lib/events.js";
import { bumpCounter } from "../lib/metrics.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";

export async function handlePortalTokenCreated(
	runtime: LaunchIndexerRuntime,
	event: PortalTokenCreatedEvent,
): Promise<{ launchId: string } | null> {
	const token = event.data.token.toLowerCase();
	const [launch] = await runtime.db
		.select({ id: schema.agentLaunches.id, predictedTokenAddress: schema.agentLaunches.predictedTokenAddress })
		.from(schema.agentLaunches)
		.where(eq(schema.agentLaunches.predictedTokenAddress, token))
		.limit(1);
	if (!launch) {
		// gap #20: portal emitted TokenCreated but we have no row with that
		// predicted address. either salt mining drifted, the portal upgraded
		// init-code under us, or this is an unrelated TokenCreated emitted
		// from the same portal. router-level `PredictedAddressMismatch`
		// already protects funds; here we just need observability.
		bumpCounter(runtime.logger, "indexer_portal_token_created_unmatched_total", 1, {
			token,
			creator: event.data.creator,
			nonce: event.data.nonce,
		});
		runtime.logger.warn(
			{
				token,
				creator: event.data.creator,
				nonce: event.data.nonce,
				name: event.data.name,
				symbol: event.data.symbol,
				txHash: event.txHash,
				blockNumber: event.blockNumber.toString(),
			},
			"portal TokenCreated has no matching predicted address (gap #20)",
		);
		return null;
	}

	await runtime.db
		.update(schema.agentLaunches)
		.set({
			flapTokenAddress: token,
			state: "launched",
			launchTimestamp: BigInt(event.data.ts),
			bundleStatus: "confirmed",
			updatedAt: new Date(),
		})
		.where(eq(schema.agentLaunches.id, launch.id));
	return { launchId: launch.id };
}

export async function handleFlapLaunchedToDex(
	runtime: LaunchIndexerRuntime,
	event: FlapLaunchedToDexEvent,
): Promise<{ launchId: string; enqueuedJobs: string[] } | null> {
	const token = event.data.token.toLowerCase();
	const [launch] = await runtime.db
		.select({ id: schema.agentLaunches.id, tokenAddress: schema.agentLaunches.tokenAddress })
		.from(schema.agentLaunches)
		.where(eq(schema.agentLaunches.flapTokenAddress, token))
		.limit(1);
	if (!launch) {
		bumpCounter(runtime.logger, "indexer_flap_launched_to_dex_unmatched_total", 1, {
			token,
			pair: event.data.pair,
		});
		runtime.logger.warn(
			{
				token,
				pair: event.data.pair,
				txHash: event.txHash,
				blockNumber: event.blockNumber.toString(),
			},
			"FlapLaunchedToDex has no matching launch row",
		);
		return null;
	}

	await runtime.db
		.update(schema.agentLaunches)
		.set({
			v2Pair: event.data.pair.toLowerCase(),
			curveFillBnb: event.data.quoteAmt,
			state: "launched",
			updatedAt: new Date(),
		})
		.where(eq(schema.agentLaunches.id, launch.id));

	const enqueuedJobs: string[] = [];
	const agentId = await lookupAgentIdForFlapLaunch(runtime, [token, launch.tokenAddress]);
	if (agentId) {
		const enqueueAgentProvisioning =
			runtime.enqueueAgentProvisioning ??
			(async (payload: AgentProvisioningJob, options?: { jobId?: string }) => {
				const { addAgentProvisioningJob } = await import("@waifufun/queue");
				return addAgentProvisioningJob(payload, options);
			});
		await enqueueAgentProvisioning(buildFlapLaunchedToDexProvisioningJob(agentId, launch.id, event), {
			jobId: `launch-indexer-${event.chainId}-${event.txHash}-${event.logIndex}-agent-provisioning-${agentId}`,
		});
		const agentEventPayload = {
			source: "launch-indexer",
			tokenAddress: event.data.token,
			pancakePair: event.data.pair,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
			chainId: String(event.chainId),
			launchId: launch.id,
		};
		await emitAgentEvent(runtime, {
			agentId,
			tokenAddress: event.data.token,
			type: "agent.bonded",
			payload: agentEventPayload,
		});
		await emitAgentEvent(runtime, {
			agentId,
			tokenAddress: event.data.token,
			type: "agent.graduated",
			payload: agentEventPayload,
		});
		enqueuedJobs.push("agent-provisioning");
	}

	return { launchId: launch.id, enqueuedJobs };
}

async function lookupAgentIdForFlapLaunch(
	runtime: LaunchIndexerRuntime,
	tokenAddresses: Array<string | null | undefined>,
): Promise<string | null> {
	const normalized = [...new Set(tokenAddresses.filter(Boolean).map((value) => value!.toLowerCase()))];
	if (normalized.length === 0) return null;
	const [persona] = await runtime.db
		.select({ agentId: schema.agentPersonas.agentId })
		.from(schema.agentPersonas)
		.where(
			sql`lower(${schema.agentPersonas.tokenAddress}) in (${sql.join(
				normalized.map((value) => sql`${value}`),
				sql`,`,
			)})`,
		)
		.limit(1);
	return persona?.agentId ?? null;
}

export function buildFlapLaunchedToDexProvisioningJob(
	agentId: string,
	launchId: string,
	event: FlapLaunchedToDexEvent,
): AgentProvisioningJob {
	return {
		agentId,
		source: "agent.bonded",
		data: {
			tokenAddress: event.data.token,
			tokenContractAddress: event.data.token,
			chain: "bsc",
			chainId: event.chainId,
			launchType: "native",
			launchId,
			txHash: event.txHash,
			blockNumber: event.blockNumber.toString(),
			poolAddress: event.data.pair,
			quoteAmount: event.data.quoteAmt,
			dexName: "pancakeswap",
		},
	};
}

async function emitAgentEvent(
	runtime: LaunchIndexerRuntime,
	input: agentEventQueries.EnqueueAgentEventInput,
): Promise<void> {
	try {
		const row = await agentEventQueries.enqueueAgentEvent(runtime.db, input);
		runtime.logger.debug(
			{
				agentEventId: row.id,
				type: row.type,
				tokenAddress: row.tokenAddress,
				agentId: row.agentId,
			},
			"agent-brain: launch event enqueued",
		);
	} catch (err) {
		runtime.logger.warn(
			{
				err,
				type: input.type,
				tokenAddress: input.tokenAddress,
				agentId: input.agentId,
			},
			"agent-brain: failed to enqueue launch event (non-fatal)",
		);
	}
}
