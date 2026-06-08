/**
 * Mirror of `packages/contracts-evm/contracts/TierMath.sol`.
 *
 * Calibrates the quoteAmt that LaunchFactory will pass to FLAP Portal so the
 * bonding curve fills with enough effective BNB to trigger graduation, after
 * FLAP's 1% protocol fee + the creator-set buyTaxBps are deducted.
 *
 * Keep in sync with the on-chain library. Reference:
 *   https://docs.flap.sh/flap/developers/basic-and-mechanism/flap-tax-token/prebond-tax
 */

const CURVE_FILL_REQUIRED_WEI = 16n * 10n ** 18n; // 16 BNB
const FLAP_PROTOCOL_FEE_BPS = 100n; // 1%
const CALIBRATION_SAFETY_MARGIN_BPS = 100n; // 1% headroom
const MAX_BUY_TAX_BPS = 1000n; // 10% absolute max (FLAP limit)

const TIER_PRESALE_CAP_WEI: Record<string, bigint> = {
	TIER_80: 16n * 10n ** 18n,
	TIER_90: 32n * 10n ** 18n,
	TIER_95: 64n * 10n ** 18n,
	TIER_98: 160n * 10n ** 18n,
	TIER_TEST: 17_340_000_000_000_000_000n,
};

/**
 * Minimum quoteAmt (BNB wei) for a given buyTaxBps that keeps the bonding curve's
 * effective fill at or above 16 BNB after FLAP fee + tax, plus 1% safety margin.
 * Throws if buyTaxBps exceeds FLAP's 1000 bps cap.
 */
export function calibratedQuoteAmtWei(buyTaxBps: number): bigint {
	const taxBps = BigInt(buyTaxBps);
	if (taxBps > MAX_BUY_TAX_BPS) {
		throw new Error(`buyTaxBps=${buyTaxBps} exceeds FLAP cap of 1000`);
	}
	const retainedBps = 10000n - FLAP_PROTOCOL_FEE_BPS - taxBps;
	const numerator = CURVE_FILL_REQUIRED_WEI * (10000n + CALIBRATION_SAFETY_MARGIN_BPS);
	// ceiling division
	return (numerator + retainedBps - 1n) / retainedBps;
}

export type TierBudget = {
	presaleCapWei: bigint;
	quoteAmtWei: bigint;
	v2BuyBnbWei: bigint;
	vestingEnabled: boolean;
};

/**
 * Full tier budget mirroring LaunchFactory.tierBudget().
 * TIER_80 is curve-only (no V2 buy); graduating tiers route the remainder
 * (presaleCap - calibratedQuoteAmt) into v2BuyBnb.
 */
export function tierBudget(tier: string, buyTaxBps: number): TierBudget {
	const presaleCapWei = TIER_PRESALE_CAP_WEI[tier];
	if (presaleCapWei === undefined) {
		throw new Error(`unknown tier ${tier}`);
	}
	if (tier === "TIER_80") {
		return {
			presaleCapWei,
			quoteAmtWei: presaleCapWei,
			v2BuyBnbWei: 0n,
			vestingEnabled: false,
		};
	}
	if (tier === "TIER_TEST") {
		return {
			presaleCapWei,
			quoteAmtWei: 16_840_000_000_000_000_000n,
			v2BuyBnbWei: 500_000_000_000_000_000n,
			vestingEnabled: false,
		};
	}
	const quoteAmtWei = calibratedQuoteAmtWei(buyTaxBps);
	if (quoteAmtWei >= presaleCapWei) {
		throw new Error(`calibratedQuoteAmt ${quoteAmtWei} exceeds presaleCap ${presaleCapWei} for ${tier}`);
	}
	return {
		presaleCapWei,
		quoteAmtWei,
		v2BuyBnbWei: presaleCapWei - quoteAmtWei,
		vestingEnabled: true,
	};
}
