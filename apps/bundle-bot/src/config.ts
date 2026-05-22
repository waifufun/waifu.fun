/**
 * Bundle-bot runtime configuration via env.
 *
 * The bot is a standalone long-running process that polls the
 * `agent_launches` table for rows with `bundleStatus IN (pending, failed_retry)`
 * and submits `BundleRouter.executeBundle()` via Puissant private RPC.
 *
 * Dry-run defaults to true under NODE_ENV=test and false otherwise.
 * In dry-run, the bot logs what it would submit but does not sign, send, or
 * mutate DB state unless `BUNDLE_BOT_DRY_RUN_WRITE_STATUS=true` is explicitly
 * set for integration-test scenarios.
 */
export interface BundleBotConfig {
	chainId: number;
	rpcUrl: string;
	puissantUrl: string;
	pollIntervalMs: number;
	batchSize: number;
	maxAttempts: number;
	dryRun: boolean;
	dryRunWriteStatus: boolean;
	walletPoolRequired: boolean;
}

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
	const value = process.env[name];
	if (value === undefined) return defaultValue;
	return value === "true";
}

export function loadBundleBotConfig(): BundleBotConfig {
	const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);
	const defaultRpc =
		chainId === 97 ? "https://data-seed-prebsc-1-s1.binance.org:8545" : "https://bsc-dataseed.binance.org";
	const dryRun = readBooleanEnv("BUNDLE_BOT_DRY_RUN", process.env.NODE_ENV === "test");
	return {
		chainId,
		rpcUrl: process.env.ALCHEMY_BSC_URL ?? process.env.BUNDLE_BOT_RPC_URL ?? defaultRpc,
		puissantUrl: process.env.PUISSANT_BSC_URL ?? "https://puissant-bsc.48.club",
		pollIntervalMs: Number(process.env.BUNDLE_BOT_POLL_INTERVAL_MS ?? 30_000),
		batchSize: Number(process.env.BUNDLE_BOT_BATCH_SIZE ?? 8),
		maxAttempts: Number(process.env.BUNDLE_BOT_MAX_ATTEMPTS ?? 3),
		dryRun,
		dryRunWriteStatus: dryRun && process.env.BUNDLE_BOT_DRY_RUN_WRITE_STATUS === "true",
		walletPoolRequired: process.env.BUNDLE_WALLET_POOL_REQUIRED === "true",
	};
}
