/**
 * Launch indexer service entrypoint.
 *
 * Run modes:
 *   - default: long-running poll loop, sleep `LAUNCH_INDEXER_POLL_INTERVAL_MS`
 *     between ticks
 *   - LAUNCH_INDEXER_RUN_ONCE=1: one tick, then exit (cron-friendly)
 */

import { createLaunchIndexerRuntime } from "./lib/runtime.js";
import { pollOnce } from "./poller.js";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
	const runtime = createLaunchIndexerRuntime();
	const runOnce = process.env.LAUNCH_INDEXER_RUN_ONCE === "1";

	runtime.logger.info(
		{
			chainId: runtime.config.chainId,
			factory: runtime.config.launchFactoryAddress,
			rpcUrl: runtime.config.rpcUrl.replace(/\/v2\/[^/]+$/, "/v2/<redacted>"),
			pollIntervalMs: runtime.config.pollIntervalMs,
			confirmations: runtime.config.confirmations.toString(),
			runOnce,
		},
		"launch indexer booting",
	);

	let stopped = false;
	const onSignal = (signal: NodeJS.Signals) => {
		runtime.logger.info({ signal }, "shutting down launch indexer");
		stopped = true;
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => onSignal(signal));
	}

	do {
		try {
			const result = await pollOnce(runtime);
			runtime.logger.info(
				{
					scannedToBlock: result.scannedToBlock.toString(),
					factoryEventCount: result.factoryEventCount,
					vaultEventCount: result.vaultEventCount,
					routerEventCount: result.routerEventCount,
					treasuryLpEventCount: result.treasuryLpEventCount,
				},
				"poll tick complete",
			);
		} catch (error) {
			runtime.logger.error(
				{
					err: error instanceof Error ? error.message : String(error),
				},
				"poll tick failed",
			);
		}

		if (runOnce || stopped) break;
		await delay(runtime.config.pollIntervalMs);
	} while (!stopped);

	runtime.logger.info("launch indexer exited cleanly");
}

void main().catch((error: unknown) => {
	// Logger may not be ready; fall back to stderr.
	console.error("launch indexer boot failed", error);
	process.exit(1);
});
