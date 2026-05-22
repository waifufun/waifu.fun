/**
 * Pure data for the "what happens at launch" FAQ. Lives in its own module
 * so vitest (node env) can verify the tier-specific branching without
 * pulling in the React render layer.
 */
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";

export type FaqItem = {
	q: string;
	a: string;
};

export function buildLaunchFaq(tier: LaunchTierInfo): FaqItem[] {
	const graduates = tier.v2BuyBnb > 0;
	return [
		{
			q: "what gets burned?",
			a: graduates
				? `the unsold supply (everything not bundled, including the platform's v2 buy) is burned at launch. it's why ${tier.label} ships with a smaller circulating supply (${tier.circulatingSupplyM}m).`
				: `the unsold portion of supply is burned at launch so what trades on pcs is what presalers + traders bought. circulating supply at open is ${tier.circulatingSupplyM}m.`,
		},
		{
			q: "when can i claim?",
			a: tier.vestingEnabled
				? "50% unlocks at tge (the moment the bundle lands). the remaining 50% vests linearly over the first 24h. you can claim any time, but only the vested portion will transfer."
				: "100% unlocks at tge. trading opens and your full allocation is claimable in one tx.",
		},
		{
			q: "what if the bundle fails?",
			a: "refunds enable. you can pull your principal plus a pro-rata share of the bonus pool (penalty bnb from early withdrawals). no fee.",
		},
		{
			q: "what happens to the bnb?",
			a: graduates
				? `the round's bnb goes to bundle the launch: ${tier.bundlePct}% buys tokens in the same block as the deploy, ${tier.v2BuyBnb} bnb is added to pcs v2 lp at open. liquidity is locked. presale-side allocations get the 50% tge + 24h linear unlock.`
				: "the round's bnb seeds the pcs bonding curve at deploy. there's no separate v2 lp; the bonding curve is the liquidity until the token graduates organically.",
		},
	];
}
