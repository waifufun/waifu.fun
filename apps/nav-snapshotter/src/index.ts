/**
 * Hourly NAV snapshotter service.
 *
 * Run modes:
 *   - default: long-running hourly loop
 *   - NAV_SNAPSHOTTER_RUN_ONCE=1: one tick, then exit (Railway cron-friendly)
 */

import { getDatabase } from "@waifufun/db";
import { createLogger } from "@waifufun/logger";

import { runNavSnapshotter } from "./snapshotter.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireDatabaseUrl(): string {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is required");
	return url;
}

async function main(): Promise<void> {
	const logger = createLogger({ service: "nav-snapshotter", level: process.env.LOG_LEVEL });
	const { db } = getDatabase(requireDatabaseUrl());
	const runOnce = process.env.NAV_SNAPSHOTTER_RUN_ONCE === "1";
	const intervalMs = Number(process.env.NAV_SNAPSHOTTER_INTERVAL_MS ?? ONE_HOUR_MS);

	logger.info({ runOnce, intervalMs }, "nav snapshotter booting");

	let stopped = false;
	const onSignal = (signal: NodeJS.Signals) => {
		logger.info({ signal }, "shutting down nav snapshotter");
		stopped = true;
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => onSignal(signal));

	do {
		try {
			const result = await runNavSnapshotter({ db });
			logger.info(result, "nav snapshot tick complete");
		} catch (error) {
			logger.error({ err: error instanceof Error ? error.message : String(error) }, "nav snapshot tick failed");
		}

		if (runOnce || stopped) break;
		await delay(intervalMs);
	} while (!stopped);

	logger.info("nav snapshotter exited cleanly");
}

void main().catch((error: unknown) => {
	console.error("nav snapshotter boot failed", error);
	process.exit(1);
});
