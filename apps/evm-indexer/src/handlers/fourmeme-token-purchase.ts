import { schema } from "@waifufun/db";
import { and, eq, sql } from "drizzle-orm";

import type { TokenPurchaseEvent } from "../lib/fourmeme-events.js";
import { getFourMemeEventId } from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { emitAgentEvent } from "./agent-event-bus.js";
import { isTrackedAgentToken, lookupAgentIdByToken } from "./fourmeme-filters.js";
import type { PortalEventHandlerResult } from "./index.js";

/** Four.meme TokenPurchase = bonding-curve buy. */
export async function handleTokenPurchaseEvent(
	runtime: IndexerRuntime,
	event: TokenPurchaseEvent,
): Promise<PortalEventHandlerResult> {
	const eventId = getFourMemeEventId(event);
	const tracked = await isTrackedAgentToken(runtime, event.data.token);

	if (!tracked) {
		runtime.logger.debug(
			{ token: event.data.token, account: event.data.account, txHash: event.txHash },
			"TokenPurchase: token not tracked, skipping",
		);
		return { handled: true, enqueuedJobs: [] };
	}

	runtime.logger.info(
		{
			eventName: event.eventName,
			token: event.data.token,
			account: event.data.account,
			amount: event.data.amount,
			cost: event.data.cost,
			price: event.data.price,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling four.meme TokenPurchase",
	);

	await runtime.db.transaction(async (tx) => {
		const [eventRecord] = await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "TokenPurchase",
				portalAddress: event.contractAddress,
				tokenAddress: event.data.token,
				actorAddress: event.data.account,
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

		if (!eventRecord) {
			throw new Error(`failed to persist TokenPurchase event ${eventId}`);
		}

		const insertedTrades = await tx
			.insert(schema.trades)
			.values({
				eventId: eventRecord.id,
				chainId: event.chainId,
				tokenAddress: event.data.token,
				traderAddress: event.data.account,
				side: "buy",
				amountIn: event.data.cost,
				amountOut: event.data.amount,
				price: event.data.price,
				usdValue: null,
				txHash: event.txHash,
				blockNumber: event.blockNumber,
				blockTimestamp: event.blockTimestamp,
			})
			.onConflictDoNothing()
			.returning({ id: schema.trades.id });

		const isFreshTrade = insertedTrades.length > 0;

		await tx
			.update(schema.tokens)
			.set({
				currentPrice: event.data.price,
				...(isFreshTrade ? { volume24h: sql`${schema.tokens.volume24h} + ${event.data.cost}::numeric` } : {}),
				reserveAmount: event.data.funds,
				virtualReserves: event.data.offers,
				...(isFreshTrade ? { holderCount: sql`${schema.tokens.holderCount} + 1` } : {}),
				lastTradeAt: event.blockTimestamp,
				lastPriceUpdate: event.blockTimestamp,
				updatedAt: event.blockTimestamp,
			})
			.where(and(eq(schema.tokens.chainId, event.chainId), eq(schema.tokens.contractAddress, event.data.token)));

		await tx
			.update(schema.curveState)
			.set({
				offers: event.data.offers,
				funds: event.data.funds,
				lastPrice: event.data.price,
				waifuBonded: sql`${event.data.funds}::numeric`,
				updatedAt: event.blockTimestamp,
			})
			.where(eq(schema.curveState.agentToken, event.data.token));
	});

	if (process.env.INDEXER_DISABLE_QUEUE_JOBS !== "1") {
		const { addCacheWarmJob } = await import("@waifufun/queue");

		await addCacheWarmJob(
			{ target: "token", tokenAddress: event.data.token, reason: "fourmeme-token-purchase" },
			{ jobId: `indexer-${eventId}-cache-warm-${event.data.token}` },
		);
	}

	runtime.webhooks.emit({
		event: "trade.happened",
		tokenAddress: event.data.token,
		chainId: event.chainId,
		timestamp: event.blockTimestamp,
		data: {
			tokenAddress: event.data.token,
			traderAddress: event.data.account,
			side: "buy",
			amountIn: event.data.cost,
			amountOut: event.data.amount,
			price: event.data.price,
			fee: event.data.fee,
			offers: event.data.offers,
			funds: event.data.funds,
			txHash: event.txHash,
			blockNumber: event.blockNumber.toString(),
		},
	});

	const agentId = await lookupAgentIdByToken(runtime, event.data.token);
	await emitAgentEvent(runtime, {
		agentId,
		tokenAddress: event.data.token,
		type: "agent.trade.buy",
		payload: {
			tokenAddress: event.data.token,
			buyer: event.data.account,
			bnbIn: event.data.cost,
			tokensOut: event.data.amount,
			price: event.data.price ?? null,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
	});

	return { handled: true, enqueuedJobs: ["cache-warm"] };
}
