/**
 * Notifications service entrypoint.
 *
 * Run modes:
 *   - default: long-running poll loop, sleep `NOTIFICATIONS_POLL_INTERVAL_MS`
 *   - NOTIFICATIONS_RUN_ONCE=1: single tick, exit
 *   - NOTIFICATIONS_DRY_RUN=1: log payloads, skip outbound HTTP
 */

import { getDatabase } from "@waifufun/db";

import { createNotificationsConfig } from "./lib/config.js";
import { DryRunChannelSender, LiveChannelSender } from "./lib/dispatcher.js";
import { logger } from "./lib/logger.js";
import { DrizzleNotificationsRepository } from "./lib/repository.js";
import { pollOnce } from "./poller.js";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
	const cfg = createNotificationsConfig();
	const { db } = getDatabase();
	const repo = new DrizzleNotificationsRepository(db);
	const sender = cfg.dryRun ? new DryRunChannelSender(cfg, logger) : new LiveChannelSender(cfg);

	logger.info(
		{
			pollIntervalMs: cfg.pollIntervalMs,
			runOnce: cfg.runOnce,
			dryRun: cfg.dryRun,
			tranches: cfg.trancheBpsThresholds,
			frontendUrl: cfg.frontendUrl ?? null,
			telegramBot: cfg.telegramBotToken ? "configured" : "missing",
		},
		"notifications service booting",
	);

	let stopped = false;
	const onSignal = (signal: NodeJS.Signals) => {
		logger.info({ signal }, "shutting down notifications service");
		stopped = true;
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => onSignal(signal));
	}

	do {
		try {
			const result = await pollOnce({ repo, sender, cfg, logger });
			logger.info(result, "poll tick complete");
		} catch (error) {
			logger.error({ err: error instanceof Error ? error.message : String(error) }, "poll tick failed");
		}

		if (cfg.runOnce || stopped) break;
		await delay(cfg.pollIntervalMs);
	} while (!stopped);

	logger.info("notifications service exited cleanly");
}

void main().catch((error: unknown) => {
	console.error("notifications boot failed", error);
	process.exit(1);
});
