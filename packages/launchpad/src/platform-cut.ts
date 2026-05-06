/**
 * Platform cut configuration.
 *
 * Waifu takes a flat percentage of the total tax stream off the top, before
 * the creator's 4-way allocation (founder / holders / burn / liquidity).
 *
 * Defaults:
 *   - 10% of total tax to platform (configurable via WAIFU_PLATFORM_CUT_BPS)
 *   - bounded between 10% and 50% in prod
 *
 * Per-agent overrides are stored in agent_personas.launchpad_config.platformCutBps
 * (creator-supplied, server validates against bounds).
 */

const parseInteger = (raw: string | undefined, fallback: number): number => {
	if (!raw) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
	return n;
};

export const DEFAULT_PLATFORM_CUT_BPS = 1000; // 10%
export const MIN_PLATFORM_CUT_BPS = 1000; // 10%
export const MAX_PLATFORM_CUT_BPS = 5000; // 50%

export const getDefaultPlatformCutBps = (): number =>
	parseInteger(
		typeof process !== "undefined" ? process.env?.WAIFU_PLATFORM_CUT_BPS : undefined,
		DEFAULT_PLATFORM_CUT_BPS,
	);

export const getMinPlatformCutBps = (): number =>
	parseInteger(
		typeof process !== "undefined" ? process.env?.WAIFU_MIN_PLATFORM_CUT_BPS : undefined,
		MIN_PLATFORM_CUT_BPS,
	);

export const getMaxPlatformCutBps = (): number =>
	parseInteger(
		typeof process !== "undefined" ? process.env?.WAIFU_MAX_PLATFORM_CUT_BPS : undefined,
		MAX_PLATFORM_CUT_BPS,
	);

export interface PlatformCutValidationContext {
	env: "prod" | "dev";
}

export const validatePlatformCutBps = (
	value: number,
	ctx: PlatformCutValidationContext,
): { ok: boolean; errors: string[] } => {
	const errors: string[] = [];
	if (!Number.isInteger(value) || value < 0 || value > 10000) {
		errors.push("platformCutBps must be an integer between 0 and 10000");
		return { ok: false, errors };
	}

	if (ctx.env === "prod") {
		const min = getMinPlatformCutBps();
		const max = getMaxPlatformCutBps();
		if (value < min) {
			errors.push(`platformCutBps must be at least ${min} in prod (currently ${value})`);
		}
		if (value > max) {
			errors.push(`platformCutBps must be at most ${max} in prod (currently ${value})`);
		}
	}

	return { ok: errors.length === 0, errors };
};
