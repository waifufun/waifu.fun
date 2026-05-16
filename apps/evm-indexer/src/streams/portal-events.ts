import { processPortalEvent } from "../handlers/index.js";
import { getPortalEventCursorPosition } from "../lib/events.js";
import type { IndexerRuntime } from "../lib/runtime.js";

export interface LivePortalStreamOptions {
	pollIntervalMs?: number;
	maxBlocksPerPoll?: bigint;
	runOnce?: boolean;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollPortalEventsOnce(runtime: IndexerRuntime, options: Required<LivePortalStreamOptions>) {
	const initialBlock = runtime.config.startBlock === 0n ? 0n : runtime.config.startBlock - 1n;
	const cursor = await runtime.cursors.ensure({
		id: runtime.cursorIds.live,
		mode: "live",
		initialBlock,
	});

	const result = await runtime.source.getLiveEvents({
		cursor,
		maxBlocks: options.maxBlocksPerPoll,
	});

	let handlerFailed = false;
	for (const event of result.events) {
		try {
			await processPortalEvent(runtime, event);
		} catch (handlerError: unknown) {
			runtime.logger.warn(
				{
					eventName: event.eventName,
					blockNumber: event.blockNumber.toString(),
					txHash: event.txHash,
					error: handlerError instanceof Error ? handlerError.message : String(handlerError),
				},
				"event handler failed; cursor will retry this event",
			);
			handlerFailed = true;
			break;
		}
		await runtime.cursors.advance(runtime.cursorIds.live, getPortalEventCursorPosition(event));
	}

	// Always advance the cursor to the scanned-to block so the indexer
	// progresses through empty ranges instead of re-polling them forever.
	if (!handlerFailed && result.scannedToBlock > cursor.lastBlock) {
		await runtime.cursors.advance(runtime.cursorIds.live, {
			blockNumber: result.scannedToBlock,
			logIndex: 0,
		});
	}

	const updatedCursor = await runtime.cursors.read(runtime.cursorIds.live);

	runtime.logger.info(
		{
			cursorId: runtime.cursorIds.live,
			eventCount: result.events.length,
			scannedToBlock: result.scannedToBlock.toString(),
			lastProcessedBlock: updatedCursor?.lastBlock.toString() ?? cursor.lastBlock.toString(),
			lastProcessedLogIndex: updatedCursor?.lastLogIndex ?? cursor.lastLogIndex,
		},
		"live portal poll finished",
	);
}

export async function startPortalLiveStream(
	runtime: IndexerRuntime,
	options: LivePortalStreamOptions = {},
): Promise<() => void> {
	const resolved: Required<LivePortalStreamOptions> = {
		pollIntervalMs: options.pollIntervalMs ?? runtime.config.livePollIntervalMs,
		maxBlocksPerPoll: options.maxBlocksPerPoll ?? runtime.config.liveMaxBlocksPerPoll,
		runOnce: options.runOnce ?? process.env.INDEXER_RUN_ONCE === "1",
	};

	await pollPortalEventsOnce(runtime, resolved);

	if (resolved.runOnce) {
		return () => undefined;
	}

	let stopped = false;

	void (async () => {
		while (!stopped) {
			await delay(resolved.pollIntervalMs);

			if (stopped) {
				return;
			}

			try {
				await pollPortalEventsOnce(runtime, resolved);
			} catch (error: unknown) {
				runtime.logger.error({ error }, "live portal poll failed");
			}
		}
	})();

	return () => {
		stopped = true;
	};
}
