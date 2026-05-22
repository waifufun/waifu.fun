// PCS V3 1%-fee tier constants. Mirror MAX_TICK_PCS_V3_1PCT in
// LaunchFactory.sol so the off-chain helper and on-chain validation
// agree. If you change one, change both.
const MAX_TICK_PCS_V3_1PCT = 887200;
const V3_TICK_SPACING_1PCT = 200;
const LN_1_0001 = Math.log(1.0001);

// Canonical MC targets in USD for the WAGMI tier ladder. Same ladder
// across TIER_80 / TIER_90 / TIER_95 / TIER_98 / TIER_TEST -- the
// difference between tiers is the LaunchVault target raise, not the
// treasury MC ladder. Confirmed with Shadow + Sol 2026-05-21.
const WAGMI_MC_TARGETS_USD = [5_000_000, 10_000_000, 25_000_000, 100_000_000];

/**
 * Round x to the nearest multiple of step using JS `Math.round`, which
 * rounds .5 toward +infinity (so Math.round(-0.5) === 0, not -1).
 * For our use case (mostly-positive tick offsets at 200 spacing), the
 * asymmetric behavior near zero is fine; tier validation on-chain rejects
 * any tier where lo >= up, so any near-zero negative case still surfaces
 * loudly. Negative-side example: -150 / 200 = -0.75 -> -1 -> -200.
 *
 * @param {number} x
 * @param {number} step
 * @returns {number}
 */
function alignToSpacing(x, step) {
	if (!Number.isFinite(x)) throw new Error("alignToSpacing: x must be finite");
	if (!Number.isInteger(step) || step <= 0) {
		throw new Error("alignToSpacing: step must be a positive integer");
	}
	return Math.round(x / step) * step;
}

/**
 * Compute the tick offset from launchTick that corresponds to multiplying
 * the token price by `ratio` (WBNB-per-token terms). Uses the standard
 * V3 identity tick = log_{1.0001}(price).
 *
 * @param {number} ratio  mcTarget / launchFdvUsd. Must be > 0.
 * @returns {number} signed tick offset (positive for ratio > 1).
 */
function ratioToTickOffset(ratio) {
	if (!Number.isFinite(ratio) || ratio <= 0) {
		throw new Error(`ratioToTickOffset: ratio must be a positive finite number, got ${ratio}`);
	}
	return Math.log(ratio) / LN_1_0001;
}

/**
 * Compute TreasuryLP5 tier tick ranges from MC targets.
 *
 * For each mcTarget:
 *   ratio = mcTarget / launchFdvUsd
 *   tickOffset = log(ratio) / log(1.0001)
 *   aligned = round(tickOffset / 200) * 200
 *   lower[i] = min(launchTick + aligned, 887200)
 *   upper[i] = 887200
 *
 * @param {number} launchTick      Initial V3 tick derived from V2
 *                                 reserves at create-launch time.
 *                                 Should already be tick-spacing aligned.
 * @param {number} launchFdvUsd    Fully-diluted valuation at launchTick,
 *                                 in USD. Must be > 0.
 * @param {number[]} mcTargets     Ordered target FDVs in USD. Defaults to
 *                                 WAGMI_MC_TARGETS_USD. Length should be
 *                                 4 (matches TreasuryLP5.TIER_COUNT).
 * @returns {{ lowers: number[], uppers: number[] }} arrays length 4 each.
 *
 * Notes:
 *   - The returned lowers are STRICTLY MONOTONIC iff the mcTargets are
 *     strictly monotonic AND no two adjacent targets collapse to the
 *     same aligned tick (e.g. for very-close targets at small launchFdv).
 *     This helper does NOT enforce monotonicity beyond rounding; callers
 *     should validate before passing to LaunchFactory.
 *   - If a target's tick offset would exceed MAX_TICK_PCS_V3_1PCT, the
 *     lower is clamped to MAX. The on-chain validator will reject any
 *     equal-or-overlapping tier, so clamped tiers must be paired with
 *     un-clamped lower neighbors.
 *
 * @throws Error on invalid inputs.
 */
function computeTreasuryTicksFromMc(launchTick, launchFdvUsd, mcTargets = WAGMI_MC_TARGETS_USD) {
	if (!Number.isInteger(launchTick)) {
		throw new Error(`computeTreasuryTicksFromMc: launchTick must be an integer, got ${launchTick}`);
	}
	if (Math.abs(launchTick) > MAX_TICK_PCS_V3_1PCT) {
		throw new Error(`computeTreasuryTicksFromMc: |launchTick| > MAX_TICK (${MAX_TICK_PCS_V3_1PCT})`);
	}
	if (!Number.isFinite(launchFdvUsd) || launchFdvUsd <= 0) {
		throw new Error(`computeTreasuryTicksFromMc: launchFdvUsd must be > 0, got ${launchFdvUsd}`);
	}
	if (!Array.isArray(mcTargets) || mcTargets.length === 0) {
		throw new Error("computeTreasuryTicksFromMc: mcTargets must be a non-empty array");
	}

	const lowers = mcTargets.map((target, i) => {
		if (!Number.isFinite(target) || target <= 0) {
			throw new Error(`computeTreasuryTicksFromMc: mcTargets[${i}] must be > 0, got ${target}`);
		}
		const ratio = target / launchFdvUsd;
		const rawOffset = ratioToTickOffset(ratio);
		const aligned = alignToSpacing(rawOffset, V3_TICK_SPACING_1PCT);
		const lower = launchTick + aligned;
		return Math.min(lower, MAX_TICK_PCS_V3_1PCT);
	});

	const uppers = mcTargets.map(() => MAX_TICK_PCS_V3_1PCT);

	return { lowers, uppers };
}

/**
 * Derive the V3-equivalent tick from V2 reserves at create-launch time.
 *
 * V2 pair price = reserveQuote / reserveBase where base = token, quote
 * = WBNB. V3 tick = log_{1.0001}(price) where price is token1/token0.
 *
 * @param {bigint} reserveToken    base reserve (the launched token).
 * @param {bigint} reserveWbnb     quote reserve (WBNB).
 * @param {boolean} tokenIsToken0  whether the launched token is token0
 *                                 in the V3 pool. If true, V3 price =
 *                                 reserveWbnb / reserveToken (since
 *                                 token1=WBNB). If false, V3 price =
 *                                 reserveToken / reserveWbnb.
 * @returns {number} signed integer tick, 200-aligned for PCS V3 1% tier.
 */
function deriveLaunchTickFromV2Reserves(reserveToken, reserveWbnb, tokenIsToken0) {
	if (typeof reserveToken !== "bigint" || typeof reserveWbnb !== "bigint") {
		throw new Error("deriveLaunchTickFromV2Reserves: reserves must be bigints");
	}
	if (reserveToken <= 0n || reserveWbnb <= 0n) {
		throw new Error("deriveLaunchTickFromV2Reserves: reserves must be positive");
	}
	// Convert to Number for log math. Both reserves are typically in 1e18
	// units, so the ratio fits well within Number precision unless one
	// side is extreme.
	const num = Number(reserveWbnb);
	const den = Number(reserveToken);
	const v3Price = tokenIsToken0 ? num / den : den / num;
	if (!Number.isFinite(v3Price) || v3Price <= 0) {
		throw new Error(`deriveLaunchTickFromV2Reserves: invalid V3 price ${v3Price}`);
	}
	const rawTick = Math.log(v3Price) / LN_1_0001;
	return alignToSpacing(rawTick, V3_TICK_SPACING_1PCT);
}

module.exports = {
	MAX_TICK_PCS_V3_1PCT,
	V3_TICK_SPACING_1PCT,
	WAGMI_MC_TARGETS_USD,
	alignToSpacing,
	ratioToTickOffset,
	computeTreasuryTicksFromMc,
	deriveLaunchTickFromV2Reserves,
};
