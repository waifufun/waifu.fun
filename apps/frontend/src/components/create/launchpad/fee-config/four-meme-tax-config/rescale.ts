import type { FourMemeTaxFeeConfig } from "@/lib/launchpad/types";

/**
 * Rescales the 4-way allocation to sum to `target` (= 10000 - platformCutBps),
 * preserving relative ratios. Liquidity absorbs rounding drift.
 */
export function rescaleAllocation(
	current: FourMemeTaxFeeConfig["allocation"],
	target: number,
): FourMemeTaxFeeConfig["allocation"] {
	const sum = current.founderBps + current.holderBps + current.burnBps + current.liquidityBps;
	if (sum === 0) {
		// All zero, distribute evenly
		const each = Math.floor(target / 4);
		return {
			founderBps: each,
			holderBps: each,
			burnBps: each,
			liquidityBps: target - 3 * each,
		};
	}
	const scale = target / sum;
	const founderBps = Math.max(0, Math.round(current.founderBps * scale));
	const holderBps = Math.max(0, Math.round(current.holderBps * scale));
	const burnBps = Math.max(0, Math.round(current.burnBps * scale));
	const liquidityBps = Math.max(0, target - founderBps - holderBps - burnBps);
	return { founderBps, holderBps, burnBps, liquidityBps };
}
