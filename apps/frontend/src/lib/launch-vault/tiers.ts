/**
 * Tier metadata mirror of `LaunchFactory.tierConfig()` plus the
 * marketing copy the launch round page surfaces in the tier card.
 *
 * Keep in sync with packages/contracts-evm/contracts/LaunchFactory.sol.
 */
export type LaunchTier = "TIER_80" | "TIER_90" | "TIER_95" | "TIER_98" | "TIER_TEST";

export type LaunchTierInfo = {
	id: LaunchTier;
	label: string;
	bundlePct: number; // headline bundle %
	presaleCapBnb: number; // total bnb cap on the presale window
	v2BuyBnb: number; // amount the launch router pushes into pcsv2 at open
	circulatingSupplyM: number; // post-burn circulating supply, in millions
	openCircMcUsdHint: string; // human estimate, copy only
	openFdvUsdHint: string; // includes burned supply, copy only
	presaler2xMultiple: string; // copy
	vestingEnabled: boolean;
};

/**
 * Source-of-truth table. Numeric values must match the on-chain tier
 * constants in `LaunchFactory.tierConfig()`. Copy fields are UI-only.
 */
export const LAUNCH_TIERS: Record<LaunchTier, LaunchTierInfo> = {
	TIER_80: {
		id: "TIER_80",
		label: "SMOL",
		bundlePct: 80,
		presaleCapBnb: 16,
		v2BuyBnb: 0,
		circulatingSupplyM: 500,
		openCircMcUsdHint: "~$25k circulating mc",
		openFdvUsdHint: "~$51k fdv",
		presaler2xMultiple: "presalers open at cost basis",
		vestingEnabled: false,
	},
	TIER_90: {
		id: "TIER_90",
		label: "BASED",
		bundlePct: 90,
		presaleCapBnb: 32,
		v2BuyBnb: 15,
		circulatingSupplyM: 400,
		openCircMcUsdHint: "~$81k circulating mc",
		openFdvUsdHint: "~$203k fdv",
		presaler2xMultiple: "presalers open at 2x cost basis",
		vestingEnabled: true,
	},
	TIER_95: {
		id: "TIER_95",
		label: "WAGMI",
		bundlePct: 95,
		presaleCapBnb: 64,
		v2BuyBnb: 47,
		circulatingSupplyM: 350,
		openCircMcUsdHint: "~$284k circulating mc",
		openFdvUsdHint: "~$813k fdv",
		presaler2xMultiple: "presalers open at 4x cost basis",
		vestingEnabled: true,
	},
	TIER_98: {
		id: "TIER_98",
		label: "GIGACHAD",
		bundlePct: 98,
		presaleCapBnb: 160,
		v2BuyBnb: 143,
		circulatingSupplyM: 320,
		openCircMcUsdHint: "~$1.6m circulating mc",
		openFdvUsdHint: "~$5.1m fdv",
		presaler2xMultiple: "presalers open at 10x cost basis",
		vestingEnabled: true,
	},
	TIER_TEST: {
		id: "TIER_TEST",
		label: "TEST",
		bundlePct: 0,
		presaleCapBnb: 0.1,
		v2BuyBnb: 0,
		circulatingSupplyM: 0,
		openCircMcUsdHint: "smoke-test only",
		openFdvUsdHint: "curve-only smoke",
		presaler2xMultiple: "proportional test split",
		vestingEnabled: false,
	},
};

export function tierFromString(value: string | null | undefined): LaunchTierInfo | null {
	if (!value) return null;
	const upper = value.toUpperCase().replace(/[^A-Z0-9_]/g, "");
	if (upper in LAUNCH_TIERS) return LAUNCH_TIERS[upper as LaunchTier];
	// allow display names: "SMOL", "BASED", "WAGMI", "GIGACHAD"
	const byLabel: Record<string, LaunchTier> = {
		SMOL: "TIER_80",
		BASED: "TIER_90",
		WAGMI: "TIER_95",
		GIGACHAD: "TIER_98",
		TEST: "TIER_TEST",
	};
	if (upper in byLabel) return LAUNCH_TIERS[byLabel[upper]!];
	// allow "tier_90", "90", "tier90"
	if (upper === "TIER_TEST") return LAUNCH_TIERS.TIER_TEST;
	const match = upper.match(/(?:TIER_?)?(\d{2})/);
	if (match) {
		const key = `TIER_${match[1]}` as LaunchTier;
		if (key in LAUNCH_TIERS) return LAUNCH_TIERS[key];
	}
	return null;
}

/**
 * Best-effort tier inference from on-chain `presaleCapBnb` when the API
 * does not return an explicit tier label. Falls back to TIER_90.
 */
export function tierFromCapWei(capWei: bigint | null | undefined): LaunchTierInfo {
	if (!capWei || capWei === 0n) return LAUNCH_TIERS.TIER_90;
	const ETHER = 10n ** 18n;
	if (capWei === 100_000_000_000_000_000n) return LAUNCH_TIERS.TIER_TEST;
	const bnb = Number(capWei / ETHER);
	if (bnb <= 16) return LAUNCH_TIERS.TIER_80;
	if (bnb <= 32) return LAUNCH_TIERS.TIER_90;
	if (bnb <= 64) return LAUNCH_TIERS.TIER_95;
	return LAUNCH_TIERS.TIER_98;
}
