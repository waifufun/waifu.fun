import { schema } from "@waifufun/db";
import { addCacheWarmJob } from "@waifufun/queue";
import { and, eq, sql } from "drizzle-orm";

import { type TokenBoughtEvent, getPortalEventId } from "../lib/events.js";
import type { IndexerRuntime } from "../lib/runtime.js";

export async function handleTokenBoughtEvent(runtime: IndexerRuntime, event: TokenBoughtEvent) {
	const eventId = getPortalEventId(event);

	runtime.logger.info(
		{
			eventName: event.eventName,
			tokenAddress: event.data.tokenAddress,
			buyerAddress: event.data.buyerAddress,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling TokenBought event",
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
				eventType: "TokenBought",
				portalAddress: event.portalAddress,
				tokenAddress: event.data.tokenAddress,
				actorAddress: event.data.buyerAddress,
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
				traderAddress: event.data.buyerAddress,
				side: "buy",
				amountIn: event.data.quoteAmount,
				amountOut: event.data.tokenAmount,
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
				buyerAddress: event.data.buyerAddress,
				quoteAmount: event.data.quoteAmount,
				tokenAmount: event.data.tokenAmount,
			},
			"processed buy trade",
		);
	});

	await addCacheWarmJob(
		{
			target: "token",
			tokenAddress: event.data.tokenAddress,
			reason: "token-bought",
		},
		{ jobId: `indexer-${eventId}-cache-warm-${event.data.tokenAddress}` },
	);

	return { handled: true, enqueuedJobs: ["cache-warm"] };
}
