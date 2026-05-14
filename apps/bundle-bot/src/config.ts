/**
 * Bundle-bot runtime configuration via env.
 *
 * The bot is a standalone long-running process that polls the
 * `agent_launches` table for rows with `bundleStatus IN (pending, failed_retry)`
 * and submits `BundleRouter.executeBundle()` via Puissant private RPC.
 *
 * Hard safety default: `BUNDLE_BOT_DRY_RUN=true` until explicitly disabled.
 * In dry-run, the bot does everything except sign + submit the actual tx;
 * it still logs the BundleParams it would have sent so ops can verify the
 * params before flipping live.
 */
export interface BundleBotConfig {
	chainId: number;
	rpcUrl: string;
	puissantUrl: string;
	pollIntervalMs: number;
	batchSize: number;
	maxAttempts: number;
	dryRun: boolean;
	walletPoolRequired: boolean;
}

export function loadBundleBotConfig(): BundleBotConfig {
	const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);
	const defaultRpc =
		chainId === 97 ? "https://data-seed-prebsc-1-s1.binance.org:8545" : "https://bsc-dataseed.binance.org";
	return {
		chainId,
		rpcUrl: process.env.ALCHEMY_BSC_URL ?? process.env.BUNDLE_BOT_RPC_URL ?? defaultRpc,
		puissantUrl: process.env.PUISSANT_BSC_URL ?? "https://puissant-bsc.48.club",
		pollIntervalMs: Number(process.env.BUNDLE_BOT_POLL_INTERVAL_MS ?? 30_000),
		batchSize: Number(process.env.BUNDLE_BOT_BATCH_SIZE ?? 8),
		maxAttempts: Number(process.env.BUNDLE_BOT_MAX_ATTEMPTS ?? 3),
		// SAFETY DEFAULT: dry-run unless explicitly disabled
		dryRun: process.env.BUNDLE_BOT_DRY_RUN !== "false",
		walletPoolRequired: process.env.BUNDLE_WALLET_POOL_REQUIRED === "true",
	};
}
