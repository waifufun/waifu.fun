/**
 * Bundle bot entry point.
 *
 * Run modes:
 *   - default: long-running poll loop, sleep `BUNDLE_BOT_POLL_INTERVAL_MS`
 *     (default 30s) between rounds
 *   - BUNDLE_BOT_RUN_ONCE=1: one round, exit. Cron-friendly.
 *
 * Safety:
 *   - BUNDLE_BOT_DRY_RUN defaults to TRUE. Set BUNDLE_BOT_DRY_RUN=false
 *     to enable real tx submission via Puissant.
 *   - Reuses the existing apps/api submitLaunchBundle + bundle-wallet-pool
 *     logic (FOR UPDATE SKIP LOCKED, KMS-decrypted private keys, 90s
 *     cooldown after each successful tx).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "@waifufun/db";
import { createLogger } from "@waifufun/logger";

import { loadBundleBotConfig } from "./config.js";
import { pollOnce } from "./loop.js";

// The submitter + wallet pool + repo logic is currently forked from
// apps/api/src/services/*. Both copies must be updated in lockstep until
// the shared code is hoisted into `packages/bundle-runtime/`. See the
// header comments on each submitter/ module.
import { submitLaunchBundle } from "./submitter/index.js";
import { listBundlePendingReady } from "./submitter/launch-repo.js";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactRpc(url: string): string {
	return url.replace(/\/v2\/[^/]+$/, "/v2/<redacted>");
}

async function main(): Promise<void> {
	const config = loadBundleBotConfig();
	const logger = createLogger({ service: "bundle-bot", level: process.env.LOG_LEVEL ?? "info" });
	const dbUrl = process.env.DATABASE_URL ?? process.env.BUNDLE_BOT_DB_URL;
	if (!dbUrl) {
		logger.error({}, "DATABASE_URL or BUNDLE_BOT_DB_URL must be set");
		process.exit(1);
	}

	const client = postgres(dbUrl);
	const db = drizzle(client, { schema });
	const runOnce = process.env.BUNDLE_BOT_RUN_ONCE === "1";

	logger.info(
		{
			chainId: config.chainId,
			rpcUrl: redactRpc(config.rpcUrl),
			puissantUrl: config.puissantUrl,
			pollIntervalMs: config.pollIntervalMs,
			batchSize: config.batchSize,
			maxAttempts: config.maxAttempts,
			dryRun: config.dryRun,
			walletPoolRequired: config.walletPoolRequired,
			runOnce,
		},
		"bundle-bot booting",
	);

	if (config.dryRun) {
		logger.warn(
			{},
			"BUNDLE_BOT_DRY_RUN is enabled (default). The bot will log bundle params but NOT submit real txs. Set BUNDLE_BOT_DRY_RUN=false to go live.",
		);
	}

	let stopped = false;
	const onSignal = (signal: NodeJS.Signals) => {
		logger.info({ signal }, "shutting down bundle-bot");
		stopped = true;
	};
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => onSignal(signal));
	}

	do {
		try {
			const result = await pollOnce({
				db,
				config,
				logger,
				listReady: listBundlePendingReady,
				submit: submitLaunchBundle,
			});
			if (result.scanned > 0) {
				logger.info(
					{
						scanned: result.scanned,
						submitted: result.submitted,
						failed: result.failed,
						skipped: result.skipped,
						errors: result.errors,
					},
					"poll round complete",
				);
			}
		} catch (error) {
			logger.error({ err: error instanceof Error ? error.message : String(error) }, "poll round failed");
		}

		if (runOnce || stopped) break;
		await delay(config.pollIntervalMs);
	} while (!stopped);

	await client.end();
	logger.info({}, "bundle-bot exited cleanly");
}

void main().catch((error: unknown) => {
	console.error("bundle-bot boot failed", error);
	process.exit(1);
});
