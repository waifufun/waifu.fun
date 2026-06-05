/**
 * Hyperliquid trading-PnL service.
 *
 * The point of this module: produce a CORRECT, deposit-excluded trading
 * PnL for an agent's Hyperliquid account(s). The old chart diffed NAV
 * (`nav[i] - nav[0]`), which folds deposits/withdrawals straight into the
 * "pnl" line, so a $2k deposit looked like +$2k of profit. That is wrong.
 *
 * Hyperliquid's own `portfolio` info endpoint already separates the two:
 *   - `accountValueHistory`: raw account value (INCLUDES deposits)   <- do not use for pnl
 *   - `pnlHistory`:          deposit-adjusted cumulative pnl          <- THIS is trading pnl
 *
 * We use `pnlHistory` for the time series and `clearinghouseState` for the
 * live unrealized/account-value snapshot. We also support aggregating a
 * PRIOR (abandoned) wallet's realized pnl into lifetime stats.
 *
 * Tax/fee income is NOT handled here on purpose. It is a separate income
 * stream and must never be summed into trading pnl.
 */

const HL_BASE_URL = "https://api.hyperliquid.xyz";

export type HlWindow = "day" | "week" | "month" | "allTime";

export type PnlPoint = { t: number; pnl: number };

export type HlPortfolioWindow = {
	accountValueHistory: Array<[number, string]>;
	pnlHistory: Array<[number, string]>;
};

type HlPortfolioResponse = Array<[string, HlPortfolioWindow]>;

type HlClearinghouse = {
	marginSummary?: { accountValue?: string | number };
	crossMarginSummary?: { accountValue?: string | number };
	withdrawable?: string | number;
	assetPositions?: Array<{ position?: { unrealizedPnl?: string | number; szi?: string | number } }>;
};

type HlFill = { closedPnl?: string | number };

function num(value: unknown, fallback = 0): number {
	if (value === null || value === undefined || value === "") return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

async function postInfo<T>(body: unknown, fetchImpl: typeof fetch = fetch): Promise<T | null> {
	try {
		const res = await fetchImpl(`${HL_BASE_URL}/info`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

/**
 * Pull the deposit-adjusted pnl series for one wallet + window.
 *
 * Returns the raw `pnlHistory` mapped to `{ t, pnl }`. Empty array on any
 * failure or missing window (honest empty, never invented).
 */
export async function fetchWalletPnlSeries(
	wallet: string,
	window: HlWindow,
	fetchImpl: typeof fetch = fetch,
): Promise<PnlPoint[]> {
	const res = await postInfo<HlPortfolioResponse>({ type: "portfolio", user: wallet }, fetchImpl);
	if (!Array.isArray(res)) return [];
	const entry = res.find(([name]) => name === window);
	const history = entry?.[1]?.pnlHistory;
	if (!Array.isArray(history)) return [];
	return history
		.map(([t, v]) => ({ t: num(t), pnl: num(v) }))
		.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.pnl));
}

/**
 * Anchor the baseline correctly.
 *
 * HL's pnlHistory carries a long leading run of flat `0.0` points from
 * before the wallet was ever funded/traded. Rendering those makes the
 * chart "start somewhere after launch" with a misleading flat tail. We
 * drop the leading zero run and keep ONE zero point immediately before
 * the first nonzero move as the true origin, then re-base the series to
 * start at 0 from that origin.
 *
 * If every point is zero (never traded), we return the last point only
 * so the chart shows a flat-at-zero line rather than a fake history.
 */
export function anchorBaseline(series: PnlPoint[]): PnlPoint[] {
	if (series.length === 0) return [];
	let firstNonZero = -1;
	for (let i = 0; i < series.length; i++) {
		if (Math.abs(series[i]?.pnl ?? 0) > 1e-9) {
			firstNonZero = i;
			break;
		}
	}
	if (firstNonZero === -1) {
		const last = series.at(-1);
		return last ? [{ t: last.t, pnl: 0 }] : [];
	}
	// keep the zero point right before first activity as the anchor (if any)
	const start = Math.max(0, firstNonZero - 1);
	const anchored = series.slice(start);
	const base = anchored[0]?.pnl ?? 0;
	return anchored.map((p) => ({ t: p.t, pnl: p.pnl - base }));
}

/** Live unrealized pnl + account value from clearinghouseState. */
export async function fetchWalletLive(
	wallet: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ accountValue: number; unrealizedPnl: number; withdrawable: number }> {
	const state = await postInfo<HlClearinghouse>({ type: "clearinghouseState", user: wallet }, fetchImpl);
	const accountValue = num(state?.marginSummary?.accountValue) || num(state?.crossMarginSummary?.accountValue) || 0;
	const withdrawable = num(state?.withdrawable);
	const unrealizedPnl = (state?.assetPositions ?? []).reduce((sum, ap) => sum + num(ap?.position?.unrealizedPnl), 0);
	return { accountValue, unrealizedPnl, withdrawable };
}

/** Win/loss tally from closed fills. null when no fills returned. */
export async function fetchWalletWinLoss(
	wallet: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ wins: number; losses: number; realizedFromFills: number } | null> {
	const fills = await postInfo<HlFill[]>({ type: "userFills", user: wallet }, fetchImpl);
	if (!Array.isArray(fills) || fills.length === 0) return null;
	let wins = 0;
	let losses = 0;
	let realizedFromFills = 0;
	for (const f of fills) {
		const pnl = num(f.closedPnl);
		if (pnl > 0) wins++;
		else if (pnl < 0) losses++;
		realizedFromFills += pnl;
	}
	return { wins, losses, realizedFromFills };
}

export type HlPnlResult = {
	wallet: string;
	priorWallets: string[];
	window: HlWindow;
	series: PnlPoint[];
	tradingPnl: {
		realized: number;
		unrealized: number;
		total: number;
		currentWallet: number;
		priorWallets: number;
	};
	accountValue: number;
	withdrawable: number;
	winLoss: { wins: number; losses: number } | null;
	ts: number;
};

/**
 * Build the full HL trading-pnl payload for an agent.
 *
 * - `series`: current wallet, deposit-excluded, baseline-anchored.
 * - lifetime trading pnl = current-wallet total (realized+unrealized) +
 *   prior-wallet realized (closed accounts are fully realized).
 * - tax income is intentionally absent (separate stream).
 */
export async function buildHlPnl(
	currentWallet: string,
	priorWallets: string[],
	window: HlWindow,
	fetchImpl: typeof fetch = fetch,
): Promise<HlPnlResult> {
	const [currentSeriesRaw, live, winLoss, ...priorSeriesAll] = await Promise.all([
		fetchWalletPnlSeries(currentWallet, window, fetchImpl),
		fetchWalletLive(currentWallet, fetchImpl),
		fetchWalletWinLoss(currentWallet, fetchImpl),
		...priorWallets.map((w) => fetchWalletPnlSeries(w, "allTime", fetchImpl)),
	]);

	const series = anchorBaseline(currentSeriesRaw);

	// current-wallet total trading pnl (deposit-excluded) = last allTime/window pnl point.
	// for lifetime correctness we always read the allTime tail of the current wallet too.
	const currentAllTime =
		window === "allTime" ? currentSeriesRaw : await fetchWalletPnlSeries(currentWallet, "allTime", fetchImpl);
	const currentTotal = currentAllTime.at(-1)?.pnl ?? 0;

	const unrealized = live.unrealizedPnl;
	const currentRealized = currentTotal - unrealized;

	// prior wallets: account closed -> entire pnl is realized.
	const priorRealized = priorSeriesAll.reduce((sum, s) => sum + (s.at(-1)?.pnl ?? 0), 0);

	const total = currentTotal + priorRealized;

	return {
		wallet: currentWallet,
		priorWallets,
		window,
		series,
		tradingPnl: {
			realized: currentRealized + priorRealized,
			unrealized,
			total,
			currentWallet: currentTotal,
			priorWallets: priorRealized,
		},
		accountValue: live.accountValue,
		withdrawable: live.withdrawable,
		winLoss: winLoss ? { wins: winLoss.wins, losses: winLoss.losses } : null,
		ts: Date.now(),
	};
}
