/**
 * Runway selector.
 *
 * Single source of truth for the days-of-runway computation surfaced in
 * the hero stat strip and the burn panel. Both call this so they can
 * never drift out of sync.
 *
 *   days = treasuryUsd / monthlyBurnUsd * 30
 *
 * Returns null when either input is missing or non-positive. Tone maps:
 *   - `negative` when days < 30
 *   - `neutral`  when days < 90
 *   - `positive` when days >= 90
 *
 * Neither input is identity-gated. Any agent with a populated
 * `monthlyBurnUsd` and a non-zero treasury gets a runway readout; agents
 * without burn data render the "unmeasured" empty state instead.
 */

export type RunwayTone = "positive" | "neutral" | "negative";

export interface RunwayResult {
	days: number | null;
	tone: RunwayTone;
}

export function computeRunway(
	treasuryUsd: number | null | undefined,
	monthlyBurnUsd: number | null | undefined,
): RunwayResult {
	if (typeof treasuryUsd !== "number" || !Number.isFinite(treasuryUsd) || treasuryUsd <= 0) {
		return { days: null, tone: "neutral" };
	}
	if (typeof monthlyBurnUsd !== "number" || !Number.isFinite(monthlyBurnUsd) || monthlyBurnUsd <= 0) {
		return { days: null, tone: "neutral" };
	}
	const days = Math.max(0, Math.floor((treasuryUsd / monthlyBurnUsd) * 30));
	const tone: RunwayTone = days < 30 ? "negative" : days < 90 ? "neutral" : "positive";
	return { days, tone };
}

export function runwayColor(tone: RunwayTone): string {
	if (tone === "positive") return "var(--positive)";
	if (tone === "negative") return "var(--negative)";
	return "var(--text-primary)";
}
