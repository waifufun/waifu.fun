/**
 * Normalize a backend `amountIn` / `amountOut` field into a human token
 * amount.
 *
 * The trades indexer writes these as raw on-chain wei strings (e.g.
 * `"100000000000000000000"` for 100 tokens at 18 decimals). Several
 * frontend surfaces (activity feed via `formatCompactNum`, position
 * tables, treasury readouts) expect a normalized float, not raw wei.
 *
 * Heuristic: anything >= 1e15 is treated as 18-decimal wei and divided
 * by 1e18. Below 1e15 we assume the upstream already normalized to a
 * plain float string (e.g. `"1.23"`, `"420"`). Lossy at the sub-wei
 * edge, which never matters for human-facing displays.
 *
 * Why the threshold sits at 1e15: 1e15 wei == 0.001 tokens. No realistic
 * human balance on a memecoin sits below 1e-3 of a token, and no
 * already-normalized token amount realistically exceeds 1e15 either
 * (1e15 == 1 quadrillion tokens; pump.fun caps individual mints far
 * below that).
 */
export function normalizeTokenAmount(raw: unknown): number {
	if (raw === undefined || raw === null || raw === "") return 0;
	const parsed = Number(String(raw));
	if (!Number.isFinite(parsed)) return 0;
	if (Math.abs(parsed) >= 1e15) {
		return parsed / 1e18;
	}
	return parsed;
}

/**
 * Normalize a native-BNB wei amount into a human BNB float.
 *
 * Unlike {@link normalizeTokenAmount}, the quote (BNB / WBNB) leg of a
 * trade is ALWAYS an 18-decimal wei string straight from the on-chain
 * `Swap` log (e.g. `"100000000000000000"` == 0.1 BNB). There is no
 * already-normalized variant to disambiguate, so we divide by 1e18
 * unconditionally. Using the {@link normalizeTokenAmount} heuristic here
 * would silently zero-ish small buys: a 0.0001 BNB swap is 1e14 wei,
 * below the 1e15 token threshold, and would be left as a raw 1e14.
 */
export function normalizeBnbAmount(raw: unknown): number {
	if (raw === undefined || raw === null || raw === "") return 0;
	const parsed = Number(String(raw));
	if (!Number.isFinite(parsed)) return 0;
	return parsed / 1e18;
}
