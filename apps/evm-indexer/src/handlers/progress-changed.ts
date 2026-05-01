import { schema } from "@waifufun/db";
import { addCacheWarmJob, addNotificationJob } from "@waifufun/queue";
import { and, eq } from "drizzle-orm";

import { type ProgressChangedEvent, getPortalEventId } from "../lib/events.js";
import type { IndexerRuntime } from "../lib/runtime.js";

export async function handleProgressChangedEvent(runtime: IndexerRuntime, event: ProgressChangedEvent) {
	const eventId = getPortalEventId(event);
	const enqueuedJobs = ["cache-warm"];

	runtime.logger.info(
		{
			eventName: event.eventName,
			tokenAddress: event.data.tokenAddress,
			progressBps: event.data.progressBps,
			blockNumber: event.blockNumber.toString(),
		},
		"handling FlapTokenProgressChanged event",
	);

	await runtime.db.transaction(async (tx) => {
		// Insert event record for audit trail
		await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "FlapTokenProgressChanged",
				portalAddress: event.portalAddress,
				tokenAddress: event.data.tokenAddress,
				actorAddress: null,
				payload: event.data as unknown as Record<string, unknown>,
				blockTimestamp: event.blockTimestamp,
				processed: true,
			})
			.onConflictDoUpdate({
				target: [schema.events.chainId, schema.events.txHash, schema.events.logIndex],
				set: {
					processed: true,
					processError: null,
				},
			});

		// Update token record with progress and reserve data
		const curveProgress = (event.data.progressBps / 100).toFixed(2); // Convert basis points to percentage

		await tx
			.update(schema.tokens)
			.set({
				curveProgress,
				reserveAmount: event.data.reserveAmount,
				updatedAt: event.blockTimestamp,
			})
			.where(and(eq(schema.tokens.chainId, event.chainId), eq(schema.tokens.contractAddress, event.data.tokenAddress)));

		runtime.logger.info(
			{
				tokenAddress: event.data.tokenAddress,
				progressBps: event.data.progressBps,
				curveProgress,
				reserveAmount: event.data.reserveAmount,
			},
			"updated token progress",
		);
	});

	await addCacheWarmJob(
		{
			target: "token",
			tokenAddress: event.data.tokenAddress,
			reason: "progress-changed",
		},
		{ jobId: `indexer-${eventId}-cache-warm-${event.data.tokenAddress}` },
	);

	if (event.data.progressBps >= 9_000) {
		await addNotificationJob(
			{
				type: "progress_milestone",
				audience: "public",
				channel: "internal",
				referenceId: event.data.tokenAddress,
				payload: {
					tokenAddress: event.data.tokenAddress,
					progressBps: event.data.progressBps,
				},
			},
			{ jobId: `indexer-${eventId}-notification-progress-milestone` },
		);

		enqueuedJobs.push("notification");
	}

	return { handled: true, enqueuedJobs };
}
