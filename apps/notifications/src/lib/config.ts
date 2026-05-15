/**
 * Runtime config for the W46 notifications service. All knobs are env-driven
 * so the same binary can run in production (long-poll, live HTTP) and in
 * tests / dry-run (one-shot, stdout only).
 */

export interface NotificationsConfig {
	pollIntervalMs: number;
	runOnce: boolean;
	dryRun: boolean;
	telegramBotToken: string | undefined;
	frontendUrl: string | undefined;
	/** Tranche thresholds expressed in BPS of presale_cap. Default 25/50/75/100%. */
	trancheBpsThresholds: readonly number[];
	/** Optional limit on launches inspected per tick (defense in depth). */
	maxLaunchesPerTick: number;
}

const DEFAULT_TRANCHE_BPS = [2_500, 5_000, 7_500, 10_000] as const;

function parseTrancheBps(raw: string | undefined): readonly number[] {
	if (!raw || raw.trim() === "") return DEFAULT_TRANCHE_BPS;
	const parsed = raw
		.split(",")
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isFinite(n) && n > 0 && n <= 10_000);
	if (parsed.length === 0) return DEFAULT_TRANCHE_BPS;
	return parsed.slice().sort((a, b) => a - b);
}

export function createNotificationsConfig(env: NodeJS.ProcessEnv = process.env): NotificationsConfig {
	return {
		pollIntervalMs: Number(env.NOTIFICATIONS_POLL_INTERVAL_MS ?? 15_000),
		runOnce: env.NOTIFICATIONS_RUN_ONCE === "1",
		dryRun: env.NOTIFICATIONS_DRY_RUN === "1",
		telegramBotToken: env.TELEGRAM_BOT_TOKEN,
		frontendUrl: env.WAIFU_FRONTEND_URL?.replace(/\/$/, ""),
		trancheBpsThresholds: parseTrancheBps(env.WAIFU_TRANCHE_BPS),
		maxLaunchesPerTick: Number(env.NOTIFICATIONS_MAX_LAUNCHES_PER_TICK ?? 200),
	};
}
