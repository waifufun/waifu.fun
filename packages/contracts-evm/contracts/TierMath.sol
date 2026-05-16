// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Pure-math library for LaunchFactory tier + tax calibration.
/// Tier values: 0=TIER_80, 1=TIER_90, 2=TIER_95, 3=TIER_98.
///
/// FLAP graduation: token graduates when
///   effective_to_curve = quoteAmt * (10000 - 100 - buyTaxBps) / 10000
///                     >= 16 BNB (CURVE_FILL_REQUIRED_WEI).
///
/// FLAP charges 1% protocol fee on every prebond trade. buyTaxBps is
/// additive on top per FLAP's prebond-tax docs. We pick the minimum
/// quoteAmt that keeps effective at or above 16 BNB plus a 1% safety
/// cushion, via ceiling division.
///
/// Sample calibrations (1% safety margin):
///   tax= 0%  -> quoteAmt = 16.33 BNB  effective = 16.16 BNB
///   tax= 1%  -> quoteAmt = 16.50 BNB  effective = 16.17 BNB
///   tax= 3%  -> quoteAmt = 16.84 BNB  effective = 16.17 BNB
///   tax= 5%  -> quoteAmt = 17.21 BNB  effective = 16.17 BNB
///   tax=10%  -> quoteAmt = 18.16 BNB  effective = 16.16 BNB
library TierMath {
    uint256 internal constant CURVE_FILL_REQUIRED_WEI = 16 ether;
    uint16 internal constant FLAP_PROTOCOL_FEE_BPS = 100;
    uint16 internal constant CALIBRATION_SAFETY_MARGIN_BPS = 100;
    uint16 internal constant MAX_BUY_TAX_BPS = 1000;

    error InvalidTaxBps();

    /// @notice Minimum quoteAmt (in BNB wei) that puts effective curve fill
    ///         at or above 16 BNB after FLAP fee + buyTaxBps, plus 1% margin.
    function calibratedQuoteAmt(uint16 buyTaxBps) internal pure returns (uint256) {
        if (buyTaxBps > MAX_BUY_TAX_BPS) revert InvalidTaxBps();
        uint256 retainedBps = 10000 - uint256(FLAP_PROTOCOL_FEE_BPS) - uint256(buyTaxBps);
        uint256 numerator = CURVE_FILL_REQUIRED_WEI * (10000 + uint256(CALIBRATION_SAFETY_MARGIN_BPS));
        return (numerator + retainedBps - 1) / retainedBps;
    }

    /// @notice Full tier budget for a given (tier, buyTaxBps).
    ///         TIER_80 is curve-only (quoteAmt == presaleCap, no V2 buy).
    ///         Graduating tiers route `presaleCap - calibratedQuoteAmt` into
    ///         v2BuyBnb so the full cap is spent (no BNB strands in vault).
    function tierBudget(uint8 tier, uint16 buyTaxBps)
        internal
        pure
        returns (uint256 presaleCapBnb, uint256 quoteAmt, uint256 v2BuyBnb, bool vestingEnabled)
    {
        if (tier == 0) {
            return (16 ether, 16 ether, 0, false);
        }
        if (tier == 1) presaleCapBnb = 32 ether;
        else if (tier == 2) presaleCapBnb = 64 ether;
        else presaleCapBnb = 160 ether;
        vestingEnabled = true;
        quoteAmt = calibratedQuoteAmt(buyTaxBps);
        if (quoteAmt >= presaleCapBnb) revert InvalidTaxBps();
        v2BuyBnb = presaleCapBnb - quoteAmt;
    }
}
