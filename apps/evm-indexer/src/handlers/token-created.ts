import { schema } from "@waifufun/db";
import { addCacheWarmJob, addNotificationJob } from "@waifufun/queue";
import { and, eq, sql } from "drizzle-orm";

import { type TokenCreatedEvent, getPortalEventId } from "../lib/events.js";
import type { IndexerRuntime } from "../lib/runtime.js";

export async function handleTokenCreatedEvent(runtime: IndexerRuntime, event: TokenCreatedEvent) {
	const eventId = getPortalEventId(event);

	runtime.logger.info(
		{
			eventName: event.eventName,
			tokenAddress: event.data.tokenAddress,
			creatorAddress: event.data.creatorAddress,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling TokenCreated event",
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
				eventType: "TokenCreated",
				portalAddress: event.portalAddress,
				tokenAddress: event.data.tokenAddress,
				actorAddress: event.data.creatorAddress,
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

		// Check if this token already exists (idempotency)
		const [existingToken] = await tx
			.select({ id: schema.tokens.id })
			.from(schema.tokens)
			.where(and(eq(schema.tokens.chainId, event.chainId), eq(schema.tokens.contractAddress, event.data.tokenAddress)))
			.limit(1);

		if (!existingToken) {
			// Insert new token
			await tx.insert(schema.tokens).values({
				chainId: event.chainId,
				contractAddress: event.data.tokenAddress,
				name: event.data.name,
				ticker: event.data.symbol,
				metadataUri: event.data.metadataUri,
				creatorAddress: event.data.creatorAddress,
				portalAddress: event.portalAddress,
				totalSupply: "1000000000000000000000000", // 1M tokens with 18 decimals (standard)
				taxRate: event.data.taxRate ?? 0,
				isTaxToken: (event.data.taxRate ?? 0) > 0,
				status: "active",
				launchPlatform: "flap",
				decimals: 18,
				volume24h: "0",
				holderCount: 0,
				createdAt: event.blockTimestamp,
				updatedAt: event.blockTimestamp,
			});

			runtime.logger.info({ tokenAddress: event.data.tokenAddress }, "created new token record");
		}

		// Check if this is a waifu launch and update launch record
		const [matchingLaunch] = await tx
			.select({ id: schema.launches.id, status: schema.launches.status })
			.from(schema.launches)
			.where(
				and(
					eq(schema.launches.chainId, event.chainId),
					eq(schema.launches.portalAddress, event.portalAddress),
					sql`lower(${schema.launches.tokenName}) = lower(${event.data.name})`,
					sql`lower(${schema.launches.tokenTicker}) = lower(${event.data.symbol})`,
				),
			)
			.orderBy(sql`${schema.launches.createdAt} desc`)
			.limit(1);

		if (matchingLaunch && matchingLaunch.status !== "live") {
			await tx
				.update(schema.launches)
				.set({
					status: "live",
					tokenAddress: event.data.tokenAddress,
					confirmedAt: event.blockTimestamp,
					updatedAt: event.blockTimestamp,
				})
				.where(eq(schema.launches.id, matchingLaunch.id));

			// Link token to launch
			await tx
				.update(schema.tokens)
				.set({
					launchId: matchingLaunch.id,
					updatedAt: event.blockTimestamp,
				})
				.where(
					and(eq(schema.tokens.chainId, event.chainId), eq(schema.tokens.contractAddress, event.data.tokenAddress)),
				);

			runtime.logger.info(
				{
					launchId: matchingLaunch.id,
					tokenAddress: event.data.tokenAddress,
				},
				"linked token to waifu launch",
			);
		}
	});

	// Enqueue follow-up jobs
	await addCacheWarmJob(
		{
			target: "token",
			tokenAddress: event.data.tokenAddress,
			reason: "token-created",
		},
		{ jobId: `indexer-${eventId}-cache-warm-${event.data.tokenAddress}` },
	);

	await addNotificationJob(
		{
			type: "token_created",
			audience: "public",
			channel: "internal",
			referenceId: event.data.tokenAddress,
			payload: {
				tokenAddress: event.data.tokenAddress,
				creatorAddress: event.data.creatorAddress,
				name: event.data.name,
				symbol: event.data.symbol,
			},
		},
		{ jobId: `indexer-${eventId}-notification-token-created` },
	);

	return { handled: true, enqueuedJobs: ["cache-warm", "notification"] };
}
