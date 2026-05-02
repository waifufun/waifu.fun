import { schema } from "@waifufun/db";
import { addCacheWarmJob } from "@waifufun/queue";
import { and, eq, sql } from "drizzle-orm";

import { type TokenSoldEvent, getPortalEventId } from "../lib/events.js";
import type { IndexerRuntime } from "../lib/runtime.js";

export async function handleTokenSoldEvent(runtime: IndexerRuntime, event: TokenSoldEvent) {
	const eventId = getPortalEventId(event);

	runtime.logger.info(
		{
			eventName: event.eventName,
			tokenAddress: event.data.tokenAddress,
			sellerAddress: event.data.sellerAddress,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling TokenSold event",
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
				eventType: "TokenSold",
				portalAddress: event.portalAddress,
				tokenAddress: event.data.tokenAddress,
				actorAddress: event.data.sellerAddress,
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

		// Insert trade record
		await tx
			.insert(schema.trades)
			.values({
				eventId: eventRecord!.id,
				chainId: event.chainId,
				tokenAddress: event.data.tokenAddress,
				traderAddress: event.data.sellerAddress,
				side: "sell",
				amountIn: event.data.tokenAmount,
				amountOut: event.data.quoteAmount,
				price: event.data.postPrice,
				txHash: event.txHash,
				blockNumber: event.blockNumber,
				blockTimestamp: event.blockTimestamp,
			})
			.onConflictDoNothing();

		// Update token record
		const currentPrice = event.data.postPrice;
		const volume = event.data.quoteAmount;

		await tx
			.update(schema.tokens)
			.set({
				volume24h: sql`COALESCE(${schema.tokens.volume24h}, 0) + ${volume}`,
				currentPrice: currentPrice ?? sql`${schema.tokens.currentPrice}`,
				lastTradeAt: event.blockTimestamp,
				lastPriceUpdate: currentPrice ? event.blockTimestamp : sql`${schema.tokens.lastPriceUpdate}`,
				updatedAt: event.blockTimestamp,
			})
			.where(and(eq(schema.tokens.chainId, event.chainId), eq(schema.tokens.contractAddress, event.data.tokenAddress)));

		runtime.logger.info(
			{
				tokenAddress: event.data.tokenAddress,
				sellerAddress: event.data.sellerAddress,
				tokenAmount: event.data.tokenAmount,
				quoteAmount: event.data.quoteAmount,
			},
			"processed sell trade",
		);
	});

	await addCacheWarmJob(
		{
			target: "token",
			tokenAddress: event.data.tokenAddress,
			reason: "token-sold",
		},
		{ jobId: `indexer-${eventId}-cache-warm-${event.data.tokenAddress}` },
	);

	return { handled: true, enqueuedJobs: ["cache-warm"] };
}
