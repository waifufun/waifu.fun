import { schema } from "@waifufun/db";

import type { NftAddedEvent, NftRemovedEvent } from "../lib/fourmeme-events.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import type { PortalEventHandlerResult } from "./index.js";

/**
 * AgentIdentifier NFT registry events. We just keep an audit trail for now —
 * the list of recognized agent NFT contracts is managed off-chain by four.meme
 * and we don't maintain our own copy. If we later want to enumerate via
 * `AgentIdentifier.isAgent(...)` for filtering, we'll read it live.
 */
export async function handleNftAddedEvent(
	runtime: IndexerRuntime,
	event: NftAddedEvent,
): Promise<PortalEventHandlerResult> {
	runtime.logger.info(
		{
			eventName: event.eventName,
			nft: event.data.nft,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"AgentIdentifier NftAdded",
	);

	await runtime.db
		.insert(schema.events)
		.values({
			chainId: event.chainId,
			blockNumber: event.blockNumber,
			txHash: event.txHash,
			logIndex: event.logIndex,
			eventType: "NftAdded",
			portalAddress: event.contractAddress,
			tokenAddress: null,
			actorAddress: event.data.nft,
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

	return { handled: true, enqueuedJobs: [] };
}

export async function handleNftRemovedEvent(
	runtime: IndexerRuntime,
	event: NftRemovedEvent,
): Promise<PortalEventHandlerResult> {
	runtime.logger.info(
		{
			eventName: event.eventName,
			nft: event.data.nft,
			blockNumber: event.blockNumber.toString(),
			txHash: event.txHash,
		},
		"AgentIdentifier NftRemoved",
	);

	await runtime.db
		.insert(schema.events)
		.values({
			chainId: event.chainId,
			blockNumber: event.blockNumber,
			txHash: event.txHash,
			logIndex: event.logIndex,
			eventType: "NftRemoved",
			portalAddress: event.contractAddress,
			tokenAddress: null,
			actorAddress: event.data.nft,
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

	return { handled: true, enqueuedJobs: [] };
}
