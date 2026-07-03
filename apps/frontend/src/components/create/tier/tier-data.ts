/**
 * W48: tier presets surfaced in the launch wizard.
 *
 * `cap` and `v2Buy` are denominated in BNB.
 * `openCircMcBnb` is the projected circulating market cap after burned supply is removed.
 * `openFdvBnb` is the fully diluted valuation, including burned supply.
 * `presaler` is the multiple a presaler is expected to clear at open (e.g. 2.0x).
 * `burn` is the % of total supply that gets burned at launch.
 * `circulatingSupplyM` is the post-burn circulating supply in millions of tokens.
 * `vesting` describes the unlock schedule applied to remaining presaler buys.
 *
 * Numbers mirror W30v3 bundle launch burn edition math.
 */
export type TierVesting = "none" | "50/50/30d";

export type TierId = 80 | 90 | 95 | 98;

export const BNB_USD_FALLBACK = 635;

export type TierPreset = {
	id: TierId;
	cap: number;
	v2Buy: number;
	openCircMcBnb: number;
	openFdvBnb: number;
	presaler: number;
	burn: number;
	circulatingSupplyM: number;
	vesting: TierVesting;
};

export const TIERS: readonly TierPreset[] = [
	{
		id: 80,
		cap: 16,
		v2Buy: 0,
		openCircMcBnb: 40,
		openFdvBnb: 80,
		presaler: 1.0,
		burn: 50,
		circulatingSupplyM: 500,
		vesting: "none",
	},
	{
		id: 90,
		cap: 32,
		v2Buy: 16,
		openCircMcBnb: 128,
		openFdvBnb: 320,
		presaler: 2.0,
		burn: 60,
		circulatingSupplyM: 400,
		vesting: "50/50/30d",
	},
	{
		id: 95,
		cap: 64,
		v2Buy: 48,
		openCircMcBnb: 448,
		openFdvBnb: 1280,
		presaler: 4.0,
		burn: 65,
		circulatingSupplyM: 350,
		vesting: "50/50/30d",
	},
	{
		id: 98,
		cap: 160,
		v2Buy: 144,
		openCircMcBnb: 2560,
		openFdvBnb: 8000,
		presaler: 10.0,
		burn: 68,
		circulatingSupplyM: 320,
		vesting: "50/50/30d",
	},
] as const;

export function getTier(id: TierId | null | undefined): TierPreset | null {
	if (id == null) return null;
	return TIERS.find((t) => t.id === id) ?? null;
}

export function tierLabel(id: TierId): string {
	return `tier_${id}`;
}

/**
 * Display name surfaced in UI. Lowercase machine id is kept available
 * via tierLabel(); this helper is the user-facing brand label.
 */
export const TIER_DISPLAY_NAME: Record<TierId, string> = {
	80: "SMOL",
	90: "BASED",
	95: "WAGMI",
	98: "GIGACHAD",
};

export function tierDisplayName(id: TierId): string {
	return TIER_DISPLAY_NAME[id];
}

export function marketCapUsd(marketCapBnb: number, bnbUsd = BNB_USD_FALLBACK): number {
	return marketCapBnb * bnbUsd;
}

export function formatUsdMarketCap(marketCapBnb: number, bnbUsd = BNB_USD_FALLBACK): string {
	const usd = marketCapUsd(marketCapBnb, bnbUsd);
	if (usd >= 1_000_000) {
		const millions = usd / 1_000_000;
		return `$${millions.toFixed(millions >= 10 ? 0 : 1)}m`;
	}
	return `$${Math.round(usd / 1_000)}k`;
}

/**
 * Total BNB the presale needs to clear before V2 graduation.
 * cap is the agent's hard cap; v2Buy is the platform's contribution at graduation.
 */
export function totalBnb(t: TierPreset): number {
	return t.cap + t.v2Buy;
}
