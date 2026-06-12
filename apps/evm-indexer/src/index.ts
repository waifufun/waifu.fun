import { closeRedisConnection } from "@waifufun/queue";

import { runFourMemeBackfill } from "./backfill/fourmeme-backfill.js";
import { runPortalBackfill } from "./backfill/portal-backfill.js";
import { createFourMemeEventSource } from "./lib/fourmeme-source.js";
import { createIndexerRuntime } from "./lib/runtime.js";
import { startTokenSnapshotCron } from "./lib/snapshots.js";
import { startAgentWalletTransferStream } from "./streams/agent-wallet-transfers.js";
import { startFourMemeLiveStream } from "./streams/fourmeme-events.js";
import { startPortalLiveStream } from "./streams/portal-events.js";
import { startStakingLiveStream } from "./streams/staking-events.js";
import { startV2PairSwapStream } from "./streams/v2-pair-swaps.js";

const runtime = createIndexerRuntime();

const DEFAULT_TOKEN_MANAGER_2 = "0x5c952063c7fc8610FFDB798152D69F0B9550762b" as const;
const DEFAULT_AGENT_IDENTIFIER = "0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13" as const;
const DEFAULT_EIP8004_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

let stopLiveStream: () => void = () => {};
let stopFourMemeStream: () => void = () => {};
let stopStakingStream: () => void = () => {};
let stopSnapshotCron: () => void = () => {};
let stopV2PairSwapStream: () => void = () => {};
let stopAgentWalletTransferStream: () => void = () => {};

async function main(): Promise<void> {
	const runOnce = process.env.INDEXER_RUN_ONCE === "1";

	stopLiveStream = await startPortalLiveStream(runtime, { runOnce });

	if (process.env.FOURMEME_BACKFILL_ENABLED === "true") {
		const contracts = {
			tokenManager2: (process.env.FOURMEME_TOKEN_MANAGER_2 ?? DEFAULT_TOKEN_MANAGER_2) as `0x${string}`,
			agentIdentifier: (process.env.FOURMEME_AGENT_IDENTIFIER ?? DEFAULT_AGENT_IDENTIFIER) as `0x${string}`,
			erc8004IdentityRegistry: (process.env.EIP8004_NFT_ADDRESS ??
				process.env.EIP8004_IDENTITY_REGISTRY ??
				DEFAULT_EIP8004_IDENTITY_REGISTRY) as `0x${string}`,
		};
		const source = createFourMemeEventSource({ logger: runtime.logger, chainId: runtime.config.chainId, contracts });
		const fromBlock = BigInt(process.env.FOURMEME_BACKFILL_START_BLOCK ?? process.env.FOURMEME_START_BLOCK ?? "0");
		const toBlock = process.env.FOURMEME_BACKFILL_TO_BLOCK
			? BigInt(process.env.FOURMEME_BACKFILL_TO_BLOCK)
			: await runtime.publicClient.getBlockNumber();
		await runFourMemeBackfill(runtime, source, {
			fromBlock,
			toBlock,
			chunkSize: BigInt(process.env.FOURMEME_BACKFILL_CHUNK_SIZE ?? runtime.config.backfillChunkSize.toString()),
		});

		const liveCursorId = `fourmeme:bsc:${runtime.config.chainId}:${contracts.tokenManager2}:live`;
		await runtime.cursors.ensure({
			id: liveCursorId,
			mode: "live",
			initialBlock: toBlock,
			contractAddress: contracts.tokenManager2,
		});
		await runtime.cursors.advance(liveCursorId, { blockNumber: toBlock, logIndex: 0 });
	}

	// Four.Meme stream (replaces deprecated V2 WaifuFunV2 indexer). Start this after the optional
	// Four.Meme backfill so both paths cannot process overlapping ranges at the same time.
	stopFourMemeStream = await startFourMemeLiveStream(runtime, { runOnce });

	// VeWaifuStaking stream (still relevant for WAIFU staking)
	stopStakingStream = await startStakingLiveStream(runtime, { runOnce });

	// PancakeSwap V2 pair swaps for launched agents. Discovers pairs from agent_launches.v2_pair.
	stopV2PairSwapStream = await startV2PairSwapStream(runtime, { runOnce });

	// Registered BSC/Arbitrum wallet transfers for agent treasuries/Safes.
	stopAgentWalletTransferStream = await startAgentWalletTransferStream(runtime, { runOnce });

	if (!runOnce) {
		stopSnapshotCron = startTokenSnapshotCron(runtime);
	}

	if (process.env.INDEXER_SKIP_BACKFILL !== "1") {
		await runPortalBackfill(runtime);
	}

	runtime.logger.info(
		{
			chainId: runtime.config.chainId,
			portalAddress: runtime.config.portalAddress,
			liveCursorId: runtime.cursorIds.live,
			backfillCursorId: runtime.cursorIds.backfill,
			runOnce,
		},
		"waifu indexer booted",
	);

	if (runOnce) {
		await closeRedisConnection();
	}
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
	runtime.logger.info({ signal }, "shutting down indexer");
	stopLiveStream();
	stopFourMemeStream();
	stopStakingStream();
	stopSnapshotCron();
	stopV2PairSwapStream();
	stopAgentWalletTransferStream();
	await closeRedisConnection();
	process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		void shutdown(signal);
	});
}

void main().catch(async (error: unknown) => {
	runtime.logger.error({ error }, "indexer boot failed");
	await closeRedisConnection();
	process.exit(1);
});
