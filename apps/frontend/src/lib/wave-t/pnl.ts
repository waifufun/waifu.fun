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

// ---------------------------------------------------------------------------
// Hyperliquid trading-PnL (the CORRECT source).
//
// The nav-diff selectors below (`selectPnlSeries`) are DEPRECATED: they
// computed `pnl = nav[i] - nav[0]`, which folds deposits/withdrawals into
// "pnl" (a $2k deposit looked like +$2k profit). The agent page now reads
// the api's /v2/agents/:id/hyperliquid/pnl route, which is HL-only,
// deposit-EXCLUDED (uses HL's own pnlHistory), baseline-anchored, and
// aggregates any prior abandoned wallet. Tax income is surfaced as a
// SEPARATE stat and never folded into trading pnl.
// ---------------------------------------------------------------------------

export type HlPnlWindow = "day" | "week" | "month" | "allTime";

export type HlPnlData = {
	wallet: string | null;
	priorWallets: string[];
	window: HlPnlWindow;
	/** deposit-excluded, baseline-anchored trading pnl series. */
	series: PnlSeriesPoint[];
	tradingPnl: {
		realized: number;
		unrealized: number;
		/** lifetime total = current wallet + prior wallet(s), deposit-excluded. */
		total: number;
		currentWallet: number;
		priorWallets: number;
	};
	/** live account value (INCLUDES deposits, shown as its own stat). */
	accountValue: number;
	withdrawable: number;
	winLoss: { wins: number; losses: number } | null;
	/** SEPARATE income stream. raw wei (numeric string). never in tradingPnl. */
	taxIncome: { amountWei: string; source: string };
};

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
/** @deprecated nav-diff folds deposits into pnl. Use `fetchHyperliquidPnl`. */
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
/** @deprecated baseline from raw nav. Use `fetchHyperliquidPnl` (deposit-excluded). */
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

function num(value: unknown, fallback = 0): number {
	if (value === null || value === undefined || value === "") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Fetch the CORRECT (HL-only, deposit-excluded) trading PnL for an agent.
 *
 * Calls /v2/agents/:address/hyperliquid/pnl. Returns `null` on any failure
 * so the chart renders its honest empty state rather than a fake line.
 *
 * @param address Agent token address (0x...)
 * @param window  day | week | month | allTime (default allTime → lifetime).
 */
export async function fetchHyperliquidPnl(
	address: string,
	window: HlPnlWindow = "allTime",
): Promise<HlPnlData | null> {
	const base = serverApiBase();
	try {
		const url = `${base}/v2/agents/${encodeURIComponent(address)}/hyperliquid/pnl?window=${window}`;
		const res = await fetch(url, { next: { revalidate: 60 } });
		if (!res.ok) return null;
		const json = (await res.json()) as Record<string, unknown>;
		const rawSeries = Array.isArray(json.series) ? (json.series as Array<{ t: unknown; pnl: unknown }>) : [];
		const series: PnlSeriesPoint[] = rawSeries
			.map((p) => ({ t: num(p.t), pnl: num(p.pnl) }))
			.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.pnl));
		const tp = (json.tradingPnl ?? {}) as Record<string, unknown>;
		const tax = (json.taxIncome ?? {}) as Record<string, unknown>;
		const wl = json.winLoss as { wins?: unknown; losses?: unknown } | null | undefined;
		return {
			wallet: typeof json.wallet === "string" ? json.wallet : null,
			priorWallets: Array.isArray(json.priorWallets) ? (json.priorWallets as string[]) : [],
			window: (typeof json.window === "string" ? json.window : window) as HlPnlWindow,
			series,
			tradingPnl: {
				realized: num(tp.realized),
				unrealized: num(tp.unrealized),
				total: num(tp.total),
				currentWallet: num(tp.currentWallet),
				priorWallets: num(tp.priorWallets),
			},
			accountValue: num(json.accountValue),
			withdrawable: num(json.withdrawable),
			winLoss: wl ? { wins: num(wl.wins), losses: num(wl.losses) } : null,
			taxIncome: {
				amountWei: typeof tax.amountWei === "string" ? tax.amountWei : "0",
				source: typeof tax.source === "string" ? tax.source : "fee_distributions.agent_share",
			},
		};
	} catch {
		return null;
	}
}
