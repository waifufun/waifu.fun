/**
 * Candle/OHLCV fetcher for the agent price chart.
 *
 * Range pills mirror the timeframes a degen actually scans on
 * dexscreener: 5m, 15m, 1h, 4h, 1d, all. Each one maps to a single
 * geckoterminal `(unit, aggregate, limit)` triple so we never aggregate
 * client-side and the chart resolution matches the label.
 *
 *   5m   - 5 min candles, 72 bars (~6h window)
 *   15m  - 15 min candles, 96 bars (~24h window)
 *   1h   - 1 hour candles, 96 bars (~4d window)
 *   4h   - 4 hour candles, 90 bars (~15d window)
 *   1d   - 1 day candles, 90 bars (~3mo window)
 *   all  - 1 day candles, max 365 bars (full available history)
 *
 * When the pool has no public OHLCV (token minted in the last few
 * minutes, no swaps yet, indexer cold), we return an empty list and
 * let the chart render an honest empty state. We no longer fall back
 * to a synthetic series in production paths because it lies about
 * data we do not have.
 */

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type CandleRange = "5m" | "15m" | "1h" | "4h" | "1d" | "all";
export type CandleSource = "geckoterminal" | "empty" | "synthetic";
export type CandleSeries = { candles: Candle[]; source: CandleSource; note: string };

type GeckoResponse = {
	data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number, number]> } };
};

type DexScreenerPair = {
	chainId?: string;
	dexId?: string;
	pairAddress?: string;
	liquidity?: { usd?: number };
};

type DexScreenerResponse = { pairs?: DexScreenerPair[] };

/** Resolve the BSC pool with the deepest liquidity for a token. */
async function resolvePool(contract: string): Promise<string | null> {
	try {
		const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contract}`, { next: { revalidate: 300 } });
		if (!res.ok) return null;
		const data = (await res.json()) as DexScreenerResponse;
		const bscPairs = (data.pairs ?? []).filter((p) => p.chainId === "bsc" && p.pairAddress);
		if (bscPairs.length === 0) return null;
		bscPairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
		return bscPairs[0]?.pairAddress ?? null;
	} catch {
		return null;
	}
}

type CandleConfig = {
	unit: "minute" | "hour" | "day";
	aggregate: number;
	limit: number;
	/** Bar duration in ms. Used by synthetic fixture only. */
	stepMs: number;
	/** Approximate window covered, surfaced in the chart footer. */
	windowLabel: string;
};

const CONFIG: Record<CandleRange, CandleConfig> = {
	"5m": { unit: "minute", aggregate: 5, limit: 72, stepMs: 300_000, windowLabel: "6h" },
	"15m": { unit: "minute", aggregate: 15, limit: 96, stepMs: 900_000, windowLabel: "24h" },
	"1h": { unit: "hour", aggregate: 1, limit: 96, stepMs: 3_600_000, windowLabel: "4d" },
	"4h": { unit: "hour", aggregate: 4, limit: 90, stepMs: 14_400_000, windowLabel: "15d" },
	"1d": { unit: "day", aggregate: 1, limit: 90, stepMs: 86_400_000, windowLabel: "3mo" },
	all: { unit: "day", aggregate: 1, limit: 365, stepMs: 86_400_000, windowLabel: "all" },
};

export function candleRangeWindowLabel(range: CandleRange): string {
	return CONFIG[range].windowLabel;
}

/** Recommended poll cadence per range. Mirrors upstream cache windows. */
export function candleRangePollMs(range: CandleRange): number {
	switch (range) {
		case "5m":
		case "15m":
			return 15_000;
		case "1h":
			return 30_000;
		default:
			return 60_000;
	}
}

function seeded(contract: string): () => number {
	let seed = 0;
	for (const char of contract) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967295;
	};
}

/**
 * Deterministic synthetic series. Retained for story / preview pages
 * where we want a non-empty chart without a live pool. Production
 * paths render the honest empty state instead.
 */
export function syntheticCandles(contract: string, range: CandleRange): Candle[] {
	const cfg = CONFIG[range];
	const rand = seeded(`${contract}:${range}`);
	const now = Date.now();
	let close = 0.00042;
	return Array.from({ length: cfg.limit }, (_, idx) => {
		const t = now - (cfg.limit - idx - 1) * cfg.stepMs;
		const o = close;
		close = Math.max(0.00001, o * (1 + (rand() - 0.47) * 0.065));
		const wick = 0.01 + rand() * 0.045;
		return {
			t,
			o,
			h: Math.max(o, close) * (1 + wick),
			l: Math.min(o, close) * (1 - wick * 0.72),
			c: close,
			v: 900 + rand() * 8800 + Math.abs(close - o) * 8_000_000,
		};
	});
}

async function fetchGeckoPool(pool: string, range: CandleRange): Promise<Candle[] | null> {
	const cfg = CONFIG[range];
	const url = new URL(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pool}/ohlcv/${cfg.unit}`);
	url.searchParams.set("aggregate", String(cfg.aggregate));
	url.searchParams.set("limit", String(cfg.limit));
	url.searchParams.set("currency", "usd");
	try {
		const res = await fetch(url, { next: { revalidate: 60 } });
		if (!res.ok) return null;
		const rows = ((await res.json()) as GeckoResponse).data?.attributes?.ohlcv_list ?? [];
		if (rows.length < 2) return null;
		return rows.map(([time, o, h, l, c, v]) => ({ t: time * 1000, o, h, l, c, v })).sort((a, b) => a.t - b.t);
	} catch {
		return null;
	}
}

async function fetchGecko(contract: string, range: CandleRange): Promise<Candle[] | null> {
	const pool = await resolvePool(contract);
	if (!pool) return null;
	return fetchGeckoPool(pool, range);
}

/**
 * Fetch a candle series for the given token + range. Always returns a
 * `CandleSeries`. When no live data is available, `candles` is empty
 * and `source === "empty"`. Callers should render an empty state in
 * that case rather than falling back to synthetic data.
 */
export async function fetchCandleSeries(contract: string, range: CandleRange = "1h"): Promise<CandleSeries> {
	const candles = await fetchGecko(contract, range);
	if (candles && candles.length > 0) {
		return { candles, source: "geckoterminal", note: `live ohlc · ${CONFIG[range].windowLabel} window` };
	}
	return {
		candles: [],
		source: "empty",
		note: "candles indexing · check back in a few minutes",
	};
}

export async function fetchCandles(contract: string, range: CandleRange = "1h"): Promise<Candle[]> {
	return (await fetchCandleSeries(contract, range)).candles;
}
