import { schema } from "@waifufun/db";
import { addCacheWarmJob, addNotificationJob } from "@waifufun/queue";
import { and, eq } from "drizzle-orm";

import { type LaunchedToDexEvent, getPortalEventId } from "../lib/events.js";
import type { IndexerRuntime } from "../lib/runtime.js";

export async function handleLaunchedToDexEvent(runtime: IndexerRuntime, event: LaunchedToDexEvent) {
	const eventId = getPortalEventId(event);

	runtime.logger.info(
		{
			eventName: event.eventName,
			tokenAddress: event.data.tokenAddress,
			poolAddress: event.data.poolAddress,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling LaunchedToDEX event",
	);

	await runtime.db.transaction(async (tx) => {
		// Insert event record for audit trail
		const [eventRecord] = await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "LaunchedToDEX",
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
			})
			.returning({ id: schema.events.id });

		// Update token record with migration status
		await tx
			.update(schema.tokens)
			.set({
				status: "migrated",
				dexPoolAddress: event.data.poolAddress,
				migratedAt: event.blockTimestamp,
				updatedAt: event.blockTimestamp,
			})
			.where(and(eq(schema.tokens.chainId, event.chainId), eq(schema.tokens.contractAddress, event.data.tokenAddress)));

		// Insert into dex_migrations table
		await tx
			.insert(schema.dexMigrations)
			.values({
				chainId: event.chainId,
				tokenAddress: event.data.tokenAddress,
				dexName: event.data.dexName ?? "pancakeswap",
				poolAddress: event.data.poolAddress,
				migrationTxHash: event.txHash,
				migrationBlock: event.blockNumber,
				status: "migrated",
				eventId: eventRecord!.id,
				migratedAt: event.blockTimestamp,
			})
			.onConflictDoUpdate({
				target: [schema.dexMigrations.chainId, schema.dexMigrations.tokenAddress],
				set: {
					status: "migrated",
					poolAddress: event.data.poolAddress,
					migrationTxHash: event.txHash,
					migrationBlock: event.blockNumber,
					migratedAt: event.blockTimestamp,
					updatedAt: event.blockTimestamp,
				},
			});

		runtime.logger.info(
			{
				tokenAddress: event.data.tokenAddress,
				poolAddress: event.data.poolAddress,
				dexName: event.data.dexName ?? "pancakeswap",
			},
			"processed DEX migration",
		);
	});

	await addCacheWarmJob(
		{
			target: "token",
			tokenAddress: event.data.tokenAddress,
			reason: "launched-to-dex",
		},
		{ jobId: `indexer-${eventId}-cache-warm-${event.data.tokenAddress}` },
	);

	await addNotificationJob(
		{
			type: "token_migrated",
			audience: "public",
			channel: "internal",
			referenceId: event.data.tokenAddress,
			payload: {
				tokenAddress: event.data.tokenAddress,
				poolAddress: event.data.poolAddress,
				dexName: event.data.dexName ?? "pancakeswap",
			},
		},
		{ jobId: `indexer-${eventId}-notification-token-migrated` },
	);

	return { handled: true, enqueuedJobs: ["cache-warm", "notification"] };
}
