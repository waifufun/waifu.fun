import {
	DEFAULT_PLATFORM_CUT_BPS,
	type FlapFeeConfig,
	type FourMemeRegularFeeConfig,
	type FourMemeTaxFeeConfig,
	type LaunchpadFeeConfig,
	type LaunchpadId,
} from "./types";

/**
 * 25% platform cut → 75% remaining → split as:
 *   founder 53.3% / holder 26.7% / burn 10% / lp 10%
 *   (= 40 / 20 / 7.5 / 7.5 of total tax under default cut)
 */
function defaultAllocation(platformCutBps: number) {
	const remaining = 10_000 - platformCutBps;
	const founderBps = Math.round(remaining * 0.5333);
	const holderBps = Math.round(remaining * 0.2667);
	const burnBps = Math.round(remaining * 0.1);
	let liquidityBps = remaining - founderBps - holderBps - burnBps;
	if (liquidityBps < 0) liquidityBps = 0;
	return { founderBps, holderBps, burnBps, liquidityBps };
}

export const DEFAULT_FOUR_MEME_TAX: FourMemeTaxFeeConfig = {
	kind: "four-meme-tax",
	taxBps: 300,
	platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
	allocation: defaultAllocation(DEFAULT_PLATFORM_CUT_BPS),
	minHolderBalance: "10000",
};

export const DEFAULT_FOUR_MEME_REGULAR: FourMemeRegularFeeConfig = {
	kind: "four-meme-regular",
};

export const DEFAULT_FLAP: FlapFeeConfig = {
	kind: "flap",
	taxBps: 300,
	platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
	recipient: "agent-treasury",
};

export function getDefaultFeeConfig(id: LaunchpadId): LaunchpadFeeConfig | null {
	switch (id) {
		case "four-meme-tax":
			return DEFAULT_FOUR_MEME_TAX;
		case "four-meme-regular":
			return DEFAULT_FOUR_MEME_REGULAR;
		case "flap":
			return DEFAULT_FLAP;
		default:
			return null;
	}
}
