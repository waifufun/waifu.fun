import { schema } from "@waifufun/db";
import { eq } from "drizzle-orm";

import type { TradeStopEvent } from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { isTrackedAgentToken } from "./fourmeme-filters.js";
import type { PortalEventHandlerResult } from "./index.js";

/**
 * Four.meme `TradeStop(token)` halts curve trading on a token. We only
 * record the event + flip status for our tracked agents.
 */
export async function handleTradeStopEvent(
	runtime: IndexerRuntime,
	event: TradeStopEvent,
): Promise<PortalEventHandlerResult> {
	const tracked = await isTrackedAgentToken(runtime, event.data.token);

	if (!tracked) {
		return { handled: true, enqueuedJobs: [] };
	}

	runtime.logger.info(
		{
			eventName: event.eventName,
			token: event.data.token,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"handling four.meme TradeStop",
	);

	await runtime.db.transaction(async (tx) => {
		await tx
			.insert(schema.events)
			.values({
				chainId: event.chainId,
				blockNumber: event.blockNumber,
				txHash: event.txHash,
				logIndex: event.logIndex,
				eventType: "TradeStop",
				portalAddress: event.contractAddress,
				tokenAddress: event.data.token,
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

		await tx
			.update(schema.curveState)
			.set({
				status: "HALT",
				updatedAt: event.blockTimestamp,
			})
			.where(eq(schema.curveState.agentToken, event.data.token));
	});

	return { handled: true, enqueuedJobs: [] };
}
