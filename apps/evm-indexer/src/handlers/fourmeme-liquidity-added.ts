import { schema } from "@waifufun/db";
import { and, eq } from "drizzle-orm";

import type { LiquidityAddedEvent } from "../lib/fourmeme-events.js";
import { getFourMemeEventId } from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { emitAgentEvent } from "./agent-event-bus.js";
import { isTrackedAgentToken, lookupAgentIdByToken } from "./fourmeme-filters.js";
import type { PortalEventHandlerResult } from "./index.js";

/**
 * Four.meme emits LiquidityAdded when a bonding curve graduates to PancakeSwap.
 * The event identifies base/quote and final curve balances; it does not expose
 * the pair address, so dexPoolAddress/pancakeswapPair are preserved for a later
 * helper backfill when already known.
 */
export async function handleLiquidityAddedEvent(
	runtime: IndexerRuntime,
	event: LiquidityAddedEvent,
): Promise<PortalEventHandlerResult> {
	const eventId = getFourMemeEventId(event);
	const tracked = await isTrackedAgentToken(runtime, event.data.base);

	if (!tracked) {
		runtime.logger.debug(
			{ base: event.data.base, quote: event.data.quote, txHash: event.txHash },
			"LiquidityAdded: token not tracked, skipping",
		);
		return { handled: true, enqueuedJobs: [] };
	}

	runtime.logger.info(
		{
			eventName: event.eventName,
			base: event.data.base,
			quote: event.data.quote,
			offers: event.data.offers,
			funds: event.data.funds,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling four.meme LiquidityAdded (graduation)",
	);

	await runtime.db.transaction(async (tx) => {
		const [eventRecord] = await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "LiquidityAdded",
				portalAddress: event.contractAddress,
				tokenAddress: event.data.base,
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

		if (!eventRecord) {
			throw new Error(`failed to persist LiquidityAdded event ${eventId}`);
		}

		await tx
			.update(schema.tokens)
			.set({
				status: "migrated",
				reserveAmount: event.data.funds,
				virtualReserves: event.data.offers,
				migratedAt: event.blockTimestamp,
				updatedAt: event.blockTimestamp,
			})
			.where(and(eq(schema.tokens.chainId, event.chainId), eq(schema.tokens.contractAddress, event.data.base)));

		await tx
			.update(schema.curveState)
			.set({
				isGraduated: true,
				status: "COMPLETED",
				offers: event.data.offers,
				funds: event.data.funds,
				raisedToken: event.data.quote,
				graduatedAt: event.blockTimestamp,
				updatedAt: event.blockTimestamp,
			})
			.where(eq(schema.curveState.agentToken, event.data.base));

		await tx
			.insert(schema.dexMigrations)
			.values({
				chainId: event.chainId,
				tokenAddress: event.data.base,
				dexName: "pancakeswap",
				poolAddress: null,
				migrationTxHash: event.txHash,
				migrationBlock: event.blockNumber,
				status: "migrated",
				eventId: eventRecord.id,
				migratedAt: event.blockTimestamp,
			})
			.onConflictDoUpdate({
				target: [schema.dexMigrations.chainId, schema.dexMigrations.tokenAddress],
				set: {
					status: "migrated",
					migrationTxHash: event.txHash,
					migrationBlock: event.blockNumber,
					eventId: eventRecord.id,
					migratedAt: event.blockTimestamp,
					updatedAt: event.blockTimestamp,
				},
			});
	});

	if (process.env.INDEXER_DISABLE_QUEUE_JOBS !== "1") {
		const { addCacheWarmJob, addNotificationJob } = await import("@waifufun/queue");

		await addCacheWarmJob(
			{ target: "token", tokenAddress: event.data.base, reason: "fourmeme-liquidity-added" },
			{ jobId: `indexer-${eventId}-cache-warm-${event.data.base}` },
		);

		await addNotificationJob(
			{
				type: "generic",
				audience: "public",
				channel: "internal",
				referenceId: event.data.base,
				payload: {
					kind: "fourmeme-graduation",
					tokenAddress: event.data.base,
					quoteAddress: event.data.quote,
					offers: event.data.offers,
					funds: event.data.funds,
				},
			},
			{ jobId: `indexer-${eventId}-notification-liquidity-added` },
		);
	}

	runtime.webhooks.emit({
		event: "token.graduated",
		tokenAddress: event.data.base,
		chainId: event.chainId,
		timestamp: event.blockTimestamp,
		data: {
			tokenAddress: event.data.base,
			quoteAddress: event.data.quote,
			offers: event.data.offers,
			funds: event.data.funds,
			pancakeswapPair: null,
			txHash: event.txHash,
			blockNumber: event.blockNumber.toString(),
		},
	});

	const agentId = await lookupAgentIdByToken(runtime, event.data.base);
	await emitAgentEvent(runtime, {
		agentId,
		tokenAddress: event.data.base,
		type: "agent.graduated",
		payload: {
			tokenAddress: event.data.base,
			pancakePair: null,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
	});

	return { handled: true, enqueuedJobs: ["cache-warm", "notification"] };
}
