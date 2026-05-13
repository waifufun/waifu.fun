/**
 * W45 tier-cron entrypoint.
 *
 * Run modes:
 *   - default: long-running poll loop, sleep `TIER_CRON_POLL_INTERVAL_MS`
 *     between rounds (default 5 min, since TWAP_WINDOW = 30 min).
 *   - TIER_CRON_RUN_ONCE=1: one round, exit. Cron-friendly.
 */

import { createTierCronRuntime } from "./lib/runtime.js";
import { pollOnce } from "./poller.js";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
	const runtime = createTierCronRuntime();
	const runOnce = process.env.TIER_CRON_RUN_ONCE === "1";

	runtime.logger.info(
		{
			chainId: runtime.config.chainId,
			rpcUrl: redactRpc(runtime.config.rpcUrl),
			pollIntervalMs: runtime.config.pollIntervalMs,
			perTxTimeoutMs: runtime.config.perTxTimeoutMs,
			maxConcurrency: runtime.config.maxConcurrency,
			signer: runtime.signerAddress ?? null,
			dryRun: runtime.config.dryRun,
			runOnce,
		},
		"tier-cron booting",
	);

	if (!runtime.signerAddress) {
		runtime.logger.warn("no TIER_CRON_SIGNER_PK configured; running in observation-only mode (no txs will be sent)");
	}

	let stopped = false;
	const onSignal = (signal: NodeJS.Signals) => {
		runtime.logger.info({ signal }, "shutting down tier-cron");
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
					candidatesScanned: result.candidatesScanned,
					bundlesReady: result.bundlesReady,
					pokesSent: result.pokesSent,
					advancesSent: result.advancesSent,
					completed: result.completed,
					skipped: result.skipped,
					errors: result.errors,
				},
				"poll round complete",
			);
		} catch (error) {
			runtime.logger.error({ err: error instanceof Error ? error.message : String(error) }, "poll round failed");
		}

		if (runOnce || stopped) break;
		await delay(runtime.config.pollIntervalMs);
	} while (!stopped);

	runtime.logger.info("tier-cron exited cleanly");
}

function redactRpc(url: string): string {
	return url.replace(/\/v2\/[^/]+$/, "/v2/<redacted>");
}

void main().catch((error: unknown) => {
	console.error("tier-cron boot failed", error);
	process.exit(1);
});
