import type { LaunchTierString } from "./types.js";

export interface LaunchTierConfigSnapshot {
	/** Vault deposit cap from LaunchFactory.tierConfig. */
	presaleCap: string;
	/** BNB sent to Flap Portal.newTokenV6 as quoteAmt. */
	quoteAmt: string;
	/** Remaining BNB swapped through PCS V2 by BundleRouter after graduation. */
	v2BuyBnb: string;
	vestingEnabled: boolean;
}

/**
 * Source of truth: LaunchFactory.tierConfig after Wave H correction.
 * Keep these snapshots in sync with the contract so persisted launch rows stay
 * historically correct even if the on-chain tier table changes later.
 */
export const LAUNCH_TIER_CONFIG: Record<LaunchTierString, LaunchTierConfigSnapshot> = {
	"80": {
		presaleCap: "16000000000000000000",
		quoteAmt: "16000000000000000000",
		v2BuyBnb: "0",
		vestingEnabled: false,
	},
	"90": {
		presaleCap: "32000000000000000000",
		quoteAmt: "20000000000000000000",
		v2BuyBnb: "12000000000000000000",
		vestingEnabled: true,
	},
	"95": {
		presaleCap: "64000000000000000000",
		quoteAmt: "20000000000000000000",
		v2BuyBnb: "44000000000000000000",
		vestingEnabled: true,
	},
	"98": {
		presaleCap: "160000000000000000000",
		quoteAmt: "20000000000000000000",
		v2BuyBnb: "140000000000000000000",
		vestingEnabled: true,
	},
} as const;

export function getLaunchTierConfigSnapshot(tier: LaunchTierString): LaunchTierConfigSnapshot {
	return LAUNCH_TIER_CONFIG[tier];
}
