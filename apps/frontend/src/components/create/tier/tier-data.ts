/**
 * W48: tier presets surfaced in the launch wizard.
 *
 * `cap` and `v2Buy` are denominated in BNB.
 * `openMc` is the projected open market cap (USD-equivalent multiple of the cap).
 * `presaler` is the multiple a presaler is expected to clear at open (e.g. 2.0x).
 * `burn` is the % of the LP / supply that gets burned at launch.
 * `vesting` describes the unlock schedule applied to remaining presaler buys.
 *
 * Numbers mirror the math behind treasury-lp-viz.shadowverse.workers.dev.
 * Source of truth lives in the w48 spec (and contracts/test/LaunchRouter.t.sol).
 */
export type TierVesting = "none" | "50/50/24h";

export type TierId = 80 | 90 | 95 | 98;

export type TierPreset = {
	id: TierId;
	cap: number;
	v2Buy: number;
	openMc: number;
	presaler: number;
	burn: number;
	vesting: TierVesting;
};

export const TIERS: readonly TierPreset[] = [
	{ id: 80, cap: 16, v2Buy: 0, openMc: 80, presaler: 1.0, burn: 50, vesting: "none" },
	{ id: 90, cap: 32, v2Buy: 16, openMc: 320, presaler: 2.0, burn: 60, vesting: "50/50/24h" },
	{ id: 95, cap: 64, v2Buy: 48, openMc: 1280, presaler: 4.0, burn: 65, vesting: "50/50/24h" },
	{ id: 98, cap: 160, v2Buy: 144, openMc: 8000, presaler: 10.0, burn: 68, vesting: "50/50/24h" },
] as const;

export function getTier(id: TierId | null | undefined): TierPreset | null {
	if (id == null) return null;
	return TIERS.find((t) => t.id === id) ?? null;
}

export function tierLabel(id: TierId): string {
	return `tier_${id}`;
}

/**
 * Total BNB the presale needs to clear before V2 graduation.
 * cap is the agent's hard cap; v2Buy is the platform's contribution at graduation.
 */
export function totalBnb(t: TierPreset): number {
	return t.cap + t.v2Buy;
}
