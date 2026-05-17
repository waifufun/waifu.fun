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

const FLAP_PROTOCOL_FEE_BPS = 100n;
const CALIBRATION_SAFETY_MARGIN_BPS = 100n;
const CURVE_FILL_REQUIRED_WEI = 16_000_000_000_000_000_000n; // 16 BNB

function calibratedQuoteAmt(buyTaxBps: number): bigint {
	const tax = BigInt(buyTaxBps);
	if (tax > 1000n) throw new Error(`Invalid tax bps: ${buyTaxBps}`);

	const retainedBps = 10000n - FLAP_PROTOCOL_FEE_BPS - tax;
	const numerator = CURVE_FILL_REQUIRED_WEI * (10000n + CALIBRATION_SAFETY_MARGIN_BPS);

	// Ceiling division, matching TierMath.tierBudget.
	return (numerator + retainedBps - 1n) / retainedBps;
}

export function getLaunchTierConfigSnapshot(tier: LaunchTierString, buyTaxBps = 300): LaunchTierConfigSnapshot {
	if (tier === "80") {
		return {
			presaleCap: "16000000000000000000",
			quoteAmt: "16000000000000000000",
			v2BuyBnb: "0",
			vestingEnabled: false,
		};
	}

	let presaleCapWei: bigint;
	if (tier === "90") presaleCapWei = 32_000_000_000_000_000_000n;
	else if (tier === "95") presaleCapWei = 64_000_000_000_000_000_000n;
	else if (tier === "98") presaleCapWei = 160_000_000_000_000_000_000n;
	else throw new Error(`Unknown tier: ${tier}`);

	const quoteAmt = calibratedQuoteAmt(buyTaxBps);
	if (quoteAmt >= presaleCapWei) throw new Error(`Tax ${buyTaxBps} makes quoteAmt exceed cap for tier ${tier}`);

	const v2BuyBnb = presaleCapWei - quoteAmt;
	return {
		presaleCap: presaleCapWei.toString(),
		quoteAmt: quoteAmt.toString(),
		v2BuyBnb: v2BuyBnb.toString(),
		vestingEnabled: true,
	};
}
