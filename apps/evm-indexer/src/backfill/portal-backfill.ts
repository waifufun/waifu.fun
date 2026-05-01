import { processPortalEvent } from "../handlers/index.js";
import type { IndexerRuntime } from "../lib/runtime.js";

export interface PortalBackfillOptions {
	fromBlock?: bigint;
	toBlock?: bigint;
	chunkSize?: bigint;
}

function minBigInt(left: bigint, right: bigint): bigint {
	return left < right ? left : right;
}

export async function runPortalBackfill(runtime: IndexerRuntime, options: PortalBackfillOptions = {}): Promise<void> {
	const fromBlock = options.fromBlock ?? runtime.config.startBlock;
	const toBlock = options.toBlock ?? runtime.config.backfillTargetBlock;
	const chunkSize = options.chunkSize ?? runtime.config.backfillChunkSize;
	const initialCursorBlock = fromBlock === 0n ? 0n : fromBlock - 1n;

	const cursor = await runtime.cursors.ensure({
		id: runtime.cursorIds.backfill,
		mode: "backfill",
		initialBlock: initialCursorBlock,
	});

	let nextFrom = cursor.lastBlock >= fromBlock ? cursor.lastBlock + 1n : fromBlock;

	if (nextFrom > toBlock) {
		runtime.logger.info(
			{
				cursorId: runtime.cursorIds.backfill,
				fromBlock: fromBlock.toString(),
				toBlock: toBlock.toString(),
				lastBlock: cursor.lastBlock.toString(),
			},
			"backfill already caught up for configured range",
		);

		return;
	}

	while (nextFrom <= toBlock) {
		const nextTo = minBigInt(nextFrom + chunkSize - 1n, toBlock);
		const events = await runtime.source.getBackfillEvents({ fromBlock: nextFrom, toBlock: nextTo });

		for (const event of events) {
			await processPortalEvent(runtime, event);
		}

		await runtime.cursors.advance(runtime.cursorIds.backfill, {
			blockNumber: nextTo,
			logIndex: 0,
		});

		runtime.logger.info(
			{
				cursorId: runtime.cursorIds.backfill,
				fromBlock: nextFrom.toString(),
				toBlock: nextTo.toString(),
				eventCount: events.length,
			},
			"backfill chunk processed",
		);

		nextFrom = nextTo + 1n;
	}
}
