import { closeRedisConnection } from "@waifufun/queue";

import { runPortalBackfill } from "./backfill/portal-backfill.js";
import { createIndexerRuntime } from "./lib/runtime.js";
import { startTokenSnapshotCron } from "./lib/snapshots.js";
import { startAgentWalletTransferStream } from "./streams/agent-wallet-transfers.js";
import { startFourMemeLiveStream } from "./streams/fourmeme-events.js";
import { startPortalLiveStream } from "./streams/portal-events.js";
import { startStakingLiveStream } from "./streams/staking-events.js";
import { startV2PairSwapStream } from "./streams/v2-pair-swaps.js";

const runtime = createIndexerRuntime();
let stopLiveStream: () => void = () => {};
let stopFourMemeStream: () => void = () => {};
let stopStakingStream: () => void = () => {};
let stopSnapshotCron: () => void = () => {};
let stopV2PairSwapStream: () => void = () => {};
let stopAgentWalletTransferStream: () => void = () => {};

async function main(): Promise<void> {
	const runOnce = process.env.INDEXER_RUN_ONCE === "1";

	stopLiveStream = await startPortalLiveStream(runtime, { runOnce });

	// Four.Meme stream (replaces deprecated V2 WaifuFunV2 indexer)
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
