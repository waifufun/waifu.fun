// Unit tests for scripts/lib/mc-to-tick.js
//
// Verifies the off-chain MC-target -> V3-tick-range computation that the
// launch wizard / dry-run scripts feed into LaunchFactory.createLaunch
// for TreasuryLP5. Wave O.1 dropped on-chain MC tracking, so this helper
// is the single source of truth for tier activation prices.

const { expect } = require("chai");
const {
	MAX_TICK_PCS_V3_1PCT,
	V3_TICK_SPACING_1PCT,
	WAGMI_MC_TARGETS_USD,
	alignToSpacing,
	ratioToTickOffset,
	computeTreasuryTicksFromMc,
	deriveLaunchTickFromV2Reserves,
} = require("../scripts/lib/mc-to-tick.js");

describe("mc-to-tick helper", () => {
	describe("WAGMI canonical case (Shadow/Sol spec, 2026-05-21)", () => {
		it("at $47k launch FDV, lowers ≈ [+46600, +53600, +62800, +76600] from launchTick", () => {
			const launchTick = 0;
			const launchFdvUsd = 47_000;
			const { lowers, uppers } = computeTreasuryTicksFromMc(launchTick, launchFdvUsd, WAGMI_MC_TARGETS_USD);

			expect(lowers).to.deep.equal([46600, 53600, 62800, 76600]);
			expect(uppers).to.deep.equal([
				MAX_TICK_PCS_V3_1PCT,
				MAX_TICK_PCS_V3_1PCT,
				MAX_TICK_PCS_V3_1PCT,
				MAX_TICK_PCS_V3_1PCT,
			]);
		});

		it("all lowers are multiples of tick spacing (200)", () => {
			const { lowers } = computeTreasuryTicksFromMc(0, 47_000);
			for (const lo of lowers) {
				expect(lo % V3_TICK_SPACING_1PCT).to.equal(0);
			}
		});

		it("all uppers equal MAX_TICK_PCS_V3_1PCT (887200)", () => {
			const { uppers } = computeTreasuryTicksFromMc(0, 47_000);
			expect(uppers).to.have.lengthOf(4);
			for (const up of uppers) expect(up).to.equal(887200);
		});

		it("lowers are strictly increasing", () => {
			const { lowers } = computeTreasuryTicksFromMc(0, 47_000);
			for (let i = 1; i < lowers.length; i++) {
				expect(lowers[i]).to.be.gt(lowers[i - 1]);
			}
		});

		it("launchTick offset translates linearly (shift the curve, keep the deltas)", () => {
			const baseFdv = 47_000;
			const a = computeTreasuryTicksFromMc(0, baseFdv);
			const b = computeTreasuryTicksFromMc(1000, baseFdv);
			// 1000 isn't 200-aligned, so each lower should shift by 1000 exactly,
			// not be re-aligned (alignment happens on the OFFSET, then we add launchTick).
			for (let i = 0; i < a.lowers.length; i++) {
				expect(b.lowers[i] - a.lowers[i]).to.equal(1000);
			}
		});
	});

	describe("input validation", () => {
		it("rejects non-integer launchTick", () => {
			expect(() => computeTreasuryTicksFromMc(1.5, 1000)).to.throw(/launchTick must be an integer/);
		});

		it("rejects launchTick out of MAX_TICK range", () => {
			expect(() => computeTreasuryTicksFromMc(900_000, 1000)).to.throw(/MAX_TICK/);
			expect(() => computeTreasuryTicksFromMc(-900_000, 1000)).to.throw(/MAX_TICK/);
		});

		it("rejects non-positive launchFdvUsd", () => {
			expect(() => computeTreasuryTicksFromMc(0, 0)).to.throw(/launchFdvUsd/);
			expect(() => computeTreasuryTicksFromMc(0, -1)).to.throw(/launchFdvUsd/);
			expect(() => computeTreasuryTicksFromMc(0, Number.NaN)).to.throw(/launchFdvUsd/);
		});

		it("rejects empty mcTargets", () => {
			expect(() => computeTreasuryTicksFromMc(0, 1000, [])).to.throw(/non-empty/);
		});

		it("rejects negative or zero MC targets", () => {
			expect(() => computeTreasuryTicksFromMc(0, 1000, [1, 0, 3])).to.throw(/mcTargets\[1\]/);
			expect(() => computeTreasuryTicksFromMc(0, 1000, [1, -5, 3])).to.throw(/mcTargets\[1\]/);
		});
	});

	describe("alignToSpacing helper", () => {
		it("rounds to nearest multiple of step", () => {
			expect(alignToSpacing(0, 200)).to.equal(0);
			expect(alignToSpacing(99, 200)).to.equal(0);
			expect(alignToSpacing(100, 200)).to.equal(200);
			expect(alignToSpacing(150, 200)).to.equal(200);
			expect(alignToSpacing(250, 200)).to.equal(200);
			expect(alignToSpacing(300, 200)).to.equal(400);
		});

		it("handles negative inputs (JS Math.round rounds .5 toward +infinity)", () => {
			// Math.round(-0.5) === 0 in JS, so -99/200 and -100/200 both round to 0.
			// -150 / 200 = -0.75 → -1 → -200. This matches the on-chain V3 convention
			// since TreasuryLP5._floorToSpacing further floor-aligns post-mint if needed.
			expect(alignToSpacing(-99, 200)).to.equal(0);
			expect(alignToSpacing(-100, 200)).to.equal(0);
			expect(alignToSpacing(-150, 200)).to.equal(-200);
			expect(alignToSpacing(-250, 200)).to.equal(-200);
			expect(alignToSpacing(-300, 200)).to.equal(-200);
			expect(alignToSpacing(-301, 200)).to.equal(-400);
			expect(alignToSpacing(-400, 200)).to.equal(-400);
		});

		it("rejects bad step", () => {
			expect(() => alignToSpacing(100, 0)).to.throw(/positive integer/);
			expect(() => alignToSpacing(100, -200)).to.throw(/positive integer/);
			expect(() => alignToSpacing(100, 1.5)).to.throw(/positive integer/);
		});

		it("rejects non-finite x", () => {
			expect(() => alignToSpacing(Number.POSITIVE_INFINITY, 200)).to.throw(/finite/);
			expect(() => alignToSpacing(Number.NaN, 200)).to.throw(/finite/);
		});
	});

	describe("ratioToTickOffset helper", () => {
		it("ratio = 1 yields tick offset 0", () => {
			expect(ratioToTickOffset(1)).to.equal(0);
		});

		it("ratio = 1.0001 yields tick offset 1 (within fp tolerance)", () => {
			expect(ratioToTickOffset(1.0001)).to.be.closeTo(1, 1e-9);
		});

		it("ratio = 2 yields ~6932 ticks", () => {
			expect(ratioToTickOffset(2)).to.be.closeTo(6931.8, 0.1);
		});

		it("rejects ratio <= 0", () => {
			expect(() => ratioToTickOffset(0)).to.throw(/positive/);
			expect(() => ratioToTickOffset(-1)).to.throw(/positive/);
		});
	});

	describe("WAGMI ladder properties (general)", () => {
		it("is launch-FDV monotone: a higher launch FDV makes activation ticks closer to launchTick", () => {
			const low = computeTreasuryTicksFromMc(0, 47_000);
			const high = computeTreasuryTicksFromMc(0, 470_000);
			for (let i = 0; i < low.lowers.length; i++) {
				expect(high.lowers[i]).to.be.lt(low.lowers[i]);
			}
		});

		it("at exactly launchFdv = first target, tier 0 lower == launchTick (off-by-rounding)", () => {
			const { lowers } = computeTreasuryTicksFromMc(0, 5_000_000);
			// 5M / 5M = 1 → tick offset 0 exactly
			expect(lowers[0]).to.equal(0);
		});

		it("clamps to MAX_TICK_PCS_V3_1PCT when an MC target is impossibly high", () => {
			// MAX_TICK 887200 corresponds to ratio ≈ exp(887200 * ln(1.0001)) ≈ e^88.7
			// ≈ 3.5e38. Use 1e60 / 47e3 to definitely overshoot.
			const { lowers } = computeTreasuryTicksFromMc(0, 47_000, [1e60]);
			expect(lowers[0]).to.equal(MAX_TICK_PCS_V3_1PCT);
		});
	});

	describe("deriveLaunchTickFromV2Reserves", () => {
		it("equal reserves yield tick 0 (price = 1)", () => {
			const t = deriveLaunchTickFromV2Reserves(10n ** 18n, 10n ** 18n, true);
			expect(t).to.equal(0);
		});

		it("token = token0: more WBNB per token = higher tick", () => {
			// 1 token : 100 WBNB ⇒ V3 price = 100 ⇒ tick ≈ 46054 (rounded down to 46000)
			const t = deriveLaunchTickFromV2Reserves(10n ** 18n, 100n * 10n ** 18n, true);
			expect(t).to.equal(46000);
		});

		it("token = token1: inverse ratio", () => {
			// reserves 1 token : 100 WBNB but token=token1 ⇒ V3 price = 1/100 ⇒ tick ≈ -46054 → -46000
			const t = deriveLaunchTickFromV2Reserves(10n ** 18n, 100n * 10n ** 18n, false);
			expect(t).to.equal(-46000);
		});

		it("rejects non-bigint reserves", () => {
			expect(() => deriveLaunchTickFromV2Reserves(1, 1, true)).to.throw(/bigints/);
		});

		it("rejects zero or negative reserves", () => {
			expect(() => deriveLaunchTickFromV2Reserves(0n, 1n, true)).to.throw(/positive/);
			expect(() => deriveLaunchTickFromV2Reserves(1n, 0n, true)).to.throw(/positive/);
		});
	});

	describe("Constants exposed match LaunchFactory.sol", () => {
		// Pin both. If the on-chain side changes one, the test fails and
		// surfaces the drift loudly.
		it("MAX_TICK_PCS_V3_1PCT == 887200", () => {
			expect(MAX_TICK_PCS_V3_1PCT).to.equal(887200);
		});
		it("V3_TICK_SPACING_1PCT == 200", () => {
			expect(V3_TICK_SPACING_1PCT).to.equal(200);
		});
		it("WAGMI_MC_TARGETS_USD == [5M, 10M, 25M, 100M]", () => {
			expect(WAGMI_MC_TARGETS_USD).to.deep.equal([5_000_000, 10_000_000, 25_000_000, 100_000_000]);
		});
	});
});
