/**
 * PnL series selector + nav-history fetcher.
 *
 * The /v2/agents/:address/nav-history endpoint returns time-series NAV
 * snapshots. The PnL chart renders deltas from the first snapshot, so a
 * fresh agent with two snapshots will already show a (probably flat)
 * line. Agents with zero snapshots get the empty state from the chart
 * component; we never invent points.
 *
 * Modular: any agent with nav_history snapshots gets a chart. Agents
 * without get the empty state. No identity gating.
 */

export type NavHistoryPoint = { t: string; nav: number };
export type PnlSeriesPoint = { t: number; pnl: number };

/**
 * Compute PnL points from NAV history. PnL is defined as
 * `nav[i] - nav[0]` (deltas from the first observed snapshot).
 *
 * Returns an empty array when:
 *   - input is empty, null, or undefined
 *   - input has only one point (cannot compute a delta)
 *   - any input point has a non-finite nav
 *
 * Returning [] is the contract; PnlChart renders its "no pnl history
 * yet" empty state on []. No mock data, no fallback fill.
 */
export function selectPnlSeries(navHistory: NavHistoryPoint[] | null | undefined): PnlSeriesPoint[] {
	if (!navHistory || navHistory.length < 2) return [];
	const points = navHistory
		.map((p) => ({ t: Date.parse(p.t), nav: Number(p.nav) }))
		.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.nav));
	if (points.length < 2) return [];
	const baseline = points[0]?.nav ?? 0;
	return points.map((p) => ({ t: p.t, pnl: p.nav - baseline }));
}

/**
 * Return the first observed nav value, i.e. the baseline against which
 * pnl deltas are computed. Used by `<PnlChart>` to derive a percentage
 * change vs the opening nav.
 *
 * Returns `null` when the history is empty, has fewer than two points,
 * or the first point is non-finite or zero. The chart treats `null` as
 * "unknown baseline" and falls back to a 0% display.
 */
export function selectPnlBaselineNav(navHistory: NavHistoryPoint[] | null | undefined): number | null {
	if (!navHistory || navHistory.length < 2) return null;
	for (const p of navHistory) {
		const t = Date.parse(p.t);
		const nav = Number(p.nav);
		if (Number.isFinite(t) && Number.isFinite(nav) && nav > 0) return nav;
	}
	return null;
}

export type NavHistoryWindow = "24h" | "7d" | "30d" | "all";
export type NavHistoryInterval = "1h" | "1d";

function serverApiBase(): string {
	const configured = process.env.WAIFU_API_BASE ?? process.env.NEXT_PUBLIC_WAIFU_API_BASE;
	if (configured && configured.length > 0) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

/**
 * Server-side fetcher for the nav-history endpoint. Returns [] on any
 * failure; the chart component renders an honest empty state.
 *
 * @param address Agent token address (0x...)
 * @param window  Time window. Default 30d for the PnL chart.
 * @param interval 1h or 1d bucketing.
 */
export async function fetchNavHistory(
	address: string,
	window: NavHistoryWindow = "30d",
	interval: NavHistoryInterval = "1h",
): Promise<NavHistoryPoint[]> {
	const base = serverApiBase();
	try {
		const url = `${base}/v2/agents/${encodeURIComponent(address)}/nav-history?window=${window}&interval=${interval}`;
		const res = await fetch(url, { next: { revalidate: 60 } });
		if (!res.ok) return [];
		const json = (await res.json()) as { ok?: boolean; data?: { points?: NavHistoryPoint[] } };
		if (!json.ok || !json.data?.points) return [];
		return json.data.points;
	} catch {
		return [];
	}
}
