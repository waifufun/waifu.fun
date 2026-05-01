import { agentEventQueries } from "@waifufun/db";

import type { IndexerRuntime } from "../lib/runtime.js";

/**
 * Thin wrapper around `agentEventQueries.enqueueAgentEvent` that swallows
 * failures after logging. Event bus enqueueing is best-effort by design —
 * indexer handlers have already committed their source-of-truth DB writes
 * by the time we call this, so a queue hiccup must not take down the
 * handler (or we'd stall the whole indexer cursor).
 */
export async function emitAgentEvent(
	runtime: IndexerRuntime,
	input: agentEventQueries.EnqueueAgentEventInput,
): Promise<void> {
	try {
		const row = await agentEventQueries.enqueueAgentEvent(runtime.db, input);
		runtime.logger.debug(
			{
				agentEventId: row.id,
				type: row.type,
				tokenAddress: row.tokenAddress,
				agentId: row.agentId,
			},
			"agent-brain: event enqueued",
		);
	} catch (err) {
		runtime.logger.warn(
			{
				err,
				type: input.type,
				tokenAddress: input.tokenAddress,
				agentId: input.agentId,
			},
			"agent-brain: failed to enqueue event (non-fatal)",
		);
	}
}
