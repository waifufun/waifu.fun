import { processStakingEvent } from "../handlers/v2-staking.js";
import type { IndexerRuntime } from "../lib/runtime.js";
import { getStakingEventCursorPosition } from "../lib/staking-events.js";
import { createStakingEventSource } from "../lib/staking-source.js";

export interface StakingLiveStreamOptions {
	pollIntervalMs?: number;
	maxBlocksPerPoll?: bigint;
	runOnce?: boolean;
}

const STAKING_CURSOR_ID = "v2-staking:bsc:live";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollStakingEventsOnce(
	runtime: IndexerRuntime,
	source: ReturnType<typeof createStakingEventSource>,
	options: Required<StakingLiveStreamOptions>,
) {
	const initialBlock = runtime.config.startBlock === 0n ? 0n : runtime.config.startBlock - 1n;
	const cursor = await runtime.cursors.ensure({
		id: STAKING_CURSOR_ID,
		mode: "live",
		initialBlock,
	});

	const result = await source.getLiveEvents({
		cursor,
		maxBlocks: options.maxBlocksPerPoll,
	});

	for (const event of result.events) {
		try {
			await processStakingEvent(runtime, event);
		} catch (handlerError: unknown) {
			runtime.logger.warn(
				{
					eventName: event.eventName,
					blockNumber: event.blockNumber.toString(),
					txHash: event.txHash,
					error: handlerError instanceof Error ? handlerError.message : String(handlerError),
				},
				"VeWaifuStaking event handler failed; cursor will retry this event",
			);
			break;
		}
		await runtime.cursors.advance(STAKING_CURSOR_ID, getStakingEventCursorPosition(event));
	}

	if (result.scannedToBlock > cursor.lastBlock) {
		await runtime.cursors.advance(STAKING_CURSOR_ID, {
			blockNumber: result.scannedToBlock,
			logIndex: 0,
		});
	}

	const updatedCursor = await runtime.cursors.read(STAKING_CURSOR_ID);

	runtime.logger.info(
		{
			cursorId: STAKING_CURSOR_ID,
			eventCount: result.events.length,
			scannedToBlock: result.scannedToBlock.toString(),
			lastProcessedBlock: updatedCursor?.lastBlock.toString() ?? cursor.lastBlock.toString(),
			lastProcessedLogIndex: updatedCursor?.lastLogIndex ?? cursor.lastLogIndex,
		},
		"VeWaifuStaking live poll finished",
	);
}

export async function startStakingLiveStream(
	runtime: IndexerRuntime,
	options: StakingLiveStreamOptions = {},
): Promise<() => void> {
	const veWaifuStaking = process.env.V2_VE_WAIFU_STAKING_ADDRESS;
	if (!veWaifuStaking) {
		runtime.logger.info("V2_VE_WAIFU_STAKING_ADDRESS not set, skipping VeWaifuStaking stream");
		return () => undefined;
	}

	const source = createStakingEventSource({
		logger: runtime.logger,
		chainId: runtime.config.chainId,
		veWaifuStaking: veWaifuStaking as `0x${string}`,
	});

	const resolved: Required<StakingLiveStreamOptions> = {
		pollIntervalMs: options.pollIntervalMs ?? runtime.config.livePollIntervalMs,
		maxBlocksPerPoll: options.maxBlocksPerPoll ?? runtime.config.liveMaxBlocksPerPoll,
		runOnce: options.runOnce ?? process.env.INDEXER_RUN_ONCE === "1",
	};

	runtime.logger.info(
		{
			veWaifuStaking,
			pollIntervalMs: resolved.pollIntervalMs,
			maxBlocksPerPoll: resolved.maxBlocksPerPoll.toString(),
		},
		"starting VeWaifuStaking event stream",
	);

	await pollStakingEventsOnce(runtime, source, resolved);

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
				await pollStakingEventsOnce(runtime, source, resolved);
			} catch (error: unknown) {
				runtime.logger.error({ error }, "VeWaifuStaking live poll failed");
			}
		}
	})();

	return () => {
		stopped = true;
	};
}
