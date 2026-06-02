import { processFourMemeEvent } from "../handlers/fourmeme-index.js";
import { getFourMemeEventCursorPosition } from "../lib/fourmeme-events.js";
import { type FourMemeContractAddresses, createFourMemeEventSource } from "../lib/fourmeme-source.js";
import type { IndexerRuntime } from "../lib/runtime.js";

export interface FourMemeLiveStreamOptions {
	pollIntervalMs?: number;
	maxBlocksPerPoll?: bigint;
	runOnce?: boolean;
}

// Default mainnet addresses from `apps/evm-indexer/projects/waifu/FOURMEME_LANDSCAPE.md`
const DEFAULT_TOKEN_MANAGER_2 = "0x5c952063c7fc8610FFDB798152D69F0B9550762b";
const DEFAULT_AGENT_IDENTIFIER = "0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13";
const DEFAULT_EIP8004_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFourMemeContractAddresses(): FourMemeContractAddresses {
	const tokenManager2 = (process.env.FOURMEME_TOKEN_MANAGER_2 ?? DEFAULT_TOKEN_MANAGER_2) as `0x${string}`;
	const agentIdentifier = (process.env.FOURMEME_AGENT_IDENTIFIER ?? DEFAULT_AGENT_IDENTIFIER) as `0x${string}`;
	const erc8004IdentityRegistry = (process.env.EIP8004_NFT_ADDRESS ??
		process.env.EIP8004_IDENTITY_REGISTRY ??
		DEFAULT_EIP8004_IDENTITY_REGISTRY) as `0x${string}`;

	return { tokenManager2, agentIdentifier, erc8004IdentityRegistry };
}

async function pollFourMemeEventsOnce(
	runtime: IndexerRuntime,
	source: ReturnType<typeof createFourMemeEventSource>,
	options: Required<FourMemeLiveStreamOptions>,
) {
	const startBlockOverride = process.env.FOURMEME_START_BLOCK
		? BigInt(process.env.FOURMEME_START_BLOCK)
		: runtime.config.startBlock;
	const initialBlock = startBlockOverride === 0n ? 0n : startBlockOverride - 1n;

	const cursorId = `fourmeme:bsc:${runtime.config.chainId}:${source.contracts.tokenManager2}:live`;
	const cursor = await runtime.cursors.ensure({
		id: cursorId,
		mode: "live",
		initialBlock,
		contractAddress: source.contracts.tokenManager2 as `0x${string}`,
	});

	const result = await source.getLiveEvents({
		cursor,
		maxBlocks: options.maxBlocksPerPoll,
	});

	let handlerFailed = false;
	for (const event of result.events) {
		try {
			await processFourMemeEvent(runtime, event);
		} catch (handlerError: unknown) {
			runtime.logger.warn(
				{
					eventName: event.eventName,
					blockNumber: event.blockNumber.toString(),
					txHash: event.txHash,
					error: handlerError instanceof Error ? handlerError.message : String(handlerError),
				},
				"four.meme event handler failed; cursor will retry this event",
			);
			handlerFailed = true;
			break;
		}
		await runtime.cursors.advance(cursorId, getFourMemeEventCursorPosition(event));
	}

	if (!handlerFailed && result.scannedToBlock > cursor.lastBlock) {
		await runtime.cursors.advance(cursorId, {
			blockNumber: result.scannedToBlock,
			logIndex: 0,
		});
	}

	const updatedCursor = await runtime.cursors.read(cursorId);

	runtime.logger.info(
		{
			cursorId,
			eventCount: result.events.length,
			scannedToBlock: result.scannedToBlock.toString(),
			lastProcessedBlock: updatedCursor?.lastBlock.toString() ?? cursor.lastBlock.toString(),
			lastProcessedLogIndex: updatedCursor?.lastLogIndex ?? cursor.lastLogIndex,
		},
		"four.meme live poll finished",
	);
}

export async function startFourMemeLiveStream(
	runtime: IndexerRuntime,
	options: FourMemeLiveStreamOptions = {},
): Promise<() => void> {
	// Opt-in via env var; graceful no-op when disabled
	if (process.env.FOURMEME_INDEXER_ENABLED !== "true") {
		runtime.logger.info("FOURMEME_INDEXER_ENABLED != true, skipping four.meme stream");
		return () => undefined;
	}

	const contracts = getFourMemeContractAddresses();

	const source = createFourMemeEventSource({
		logger: runtime.logger,
		chainId: runtime.config.chainId,
		contracts,
	});

	const resolved: Required<FourMemeLiveStreamOptions> = {
		pollIntervalMs: options.pollIntervalMs ?? runtime.config.livePollIntervalMs,
		maxBlocksPerPoll: options.maxBlocksPerPoll ?? runtime.config.liveMaxBlocksPerPoll,
		runOnce: options.runOnce ?? process.env.INDEXER_RUN_ONCE === "1",
	};

	runtime.logger.info(
		{
			contracts,
			pollIntervalMs: resolved.pollIntervalMs,
			maxBlocksPerPoll: resolved.maxBlocksPerPoll.toString(),
		},
		"starting four.meme event stream",
	);

	await pollFourMemeEventsOnce(runtime, source, resolved);

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
				await pollFourMemeEventsOnce(runtime, source, resolved);
			} catch (error: unknown) {
				runtime.logger.error({ error }, "four.meme live poll failed");
			}
		}
	})();

	return () => {
		stopped = true;
	};
}
