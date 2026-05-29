/**
 * TreasuryLP4 event handlers (gap F16, waifufun#599).
 *
 * Every indexed TreasuryLP4 event maps to one append-only row in
 * `treasury_lp_events`. The dispatcher (`handleTreasuryLpEvent`) flattens the
 * decoded envelope into a discriminated row: `eventKind` is the variant, the
 * full decoded `data` is persisted as `payload`, and `tierIdx` / `agentSafe`
 * are promoted to typed columns when the variant carries them.
 *
 * Inserts are idempotent on (tx_hash, log_index, block_hash) so re-running the
 * indexer over the same block range does not duplicate rows, while a reorg that
 * replays the same (tx_hash, log_index) at a new block hash is recorded
 * distinctly rather than silently dropped (waifufun#601).
 */

import { type JsonMap, type TreasuryLpEventKind, schema } from "@waifufun/db";

import type { TreasuryLpEvent } from "../lib/events.js";
import type { LaunchIndexerRuntime } from "../lib/runtime.js";

export interface TreasuryLpHandlerContext {
	launchId: string;
}

/** Extract the promoted `tierIdx` column value, if this variant carries one. */
function tierIdxOf(event: TreasuryLpEvent): number | null {
	switch (event.eventName) {
		case "TierEpochAdvanced":
		case "TierEpochsReset":
		case "TierDeployed":
		case "TierPaused":
			return event.data.tierIdx;
		default:
			return null;
	}
}

/** Extract the promoted `agentSafe` column value, if this variant carries one. */
function agentSafeOf(event: TreasuryLpEvent): string | null {
	switch (event.eventName) {
		case "BnbClaimed":
		case "TokenFeesClaimed":
			return event.data.agentSafe.toLowerCase();
		default:
			return null;
	}
}

export async function handleTreasuryLpEvent(
	runtime: LaunchIndexerRuntime,
	event: TreasuryLpEvent,
	ctx: TreasuryLpHandlerContext,
): Promise<void> {
	await runtime.db
		.insert(schema.treasuryLpEvents)
		.values({
			launchId: ctx.launchId,
			treasuryLpAddress: event.contractAddress.toLowerCase(),
			eventKind: event.eventName as TreasuryLpEventKind,
			tierIdx: tierIdxOf(event),
			agentSafeAddress: agentSafeOf(event),
			payload: event.data as unknown as JsonMap,
			txHash: event.txHash,
			blockNumber: event.blockNumber,
			blockHash: event.blockHash,
			logIndex: event.logIndex,
		})
		.onConflictDoNothing();

	runtime.logger.debug(
		{
			launchId: ctx.launchId,
			eventKind: event.eventName,
			treasuryLp: event.contractAddress,
			tx: event.txHash,
		},
		"treasury-lp event indexed",
	);
}
