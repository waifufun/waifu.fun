/**
 * Pure data for the "what happens at launch" FAQ. Lives in its own module
 * so vitest (node env) can verify the tier-specific branching without
 * pulling in the React render layer.
 *
 * The render layer (launch-faq.tsx) resolves the keys via the locale
 * context's `t()` function. We keep the structure pure so tier-aware
 * branching is testable in isolation.
 */
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";

export type FaqItem = {
	/** i18n key for the question text. Lives under `launch.faq.*`. */
	qKey: string;
	/** i18n key for the answer text. */
	aKey: string;
	/** Parameters for `t()` interpolation on the answer key. */
	params?: Record<string, string>;
};

export function buildLaunchFaq(tier: LaunchTierInfo): FaqItem[] {
	const graduates = tier.v2BuyBnb > 0;
	return [
		{
			qKey: "launch.faq.qBurned",
			aKey: graduates ? "launch.faq.aBurnedGraduates" : "launch.faq.aBurnedNoGraduate",
			params: {
				tier: tier.label,
				circulatingSupplyM: String(tier.circulatingSupplyM),
			},
		},
		{
			qKey: "launch.faq.qClaim",
			aKey: tier.vestingEnabled ? "launch.faq.aClaimVesting" : "launch.faq.aClaimNoVesting",
		},
		{
			qKey: "launch.faq.qBundleFails",
			aKey: "launch.faq.aBundleFails",
		},
		{
			qKey: "launch.faq.qBnbDestination",
			aKey: graduates ? "launch.faq.aBnbDestinationGraduates" : "launch.faq.aBnbDestinationNoGraduate",
			params: {
				bundlePct: String(tier.bundlePct),
				v2BuyBnb: String(tier.v2BuyBnb),
			},
		},
	];
}
