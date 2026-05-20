export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
export type CandleRange = "1m" | "5m" | "1h" | "4h" | "1d" | "7d";
export type CandleSeries = { candles: Candle[]; source: "geckoterminal" | "synthetic"; note: string };

type GeckoResponse = {
	data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number, number]> } };
};
const CONFIG: Record<CandleRange, { unit: "minute" | "hour"; aggregate: number; limit: number; stepMs: number }> = {
	"1m": { unit: "minute", aggregate: 1, limit: 60, stepMs: 60_000 },
	"5m": { unit: "minute", aggregate: 5, limit: 72, stepMs: 300_000 },
	"1h": { unit: "minute", aggregate: 15, limit: 80, stepMs: 900_000 },
	"4h": { unit: "hour", aggregate: 1, limit: 96, stepMs: 3_600_000 },
	"1d": { unit: "hour", aggregate: 1, limit: 72, stepMs: 3_600_000 },
	"7d": { unit: "hour", aggregate: 4, limit: 84, stepMs: 14_400_000 },
};

function seeded(contract: string): () => number {
	let seed = 0;
	for (const char of contract) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
	return () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967295;
	};
}

function synthetic(contract: string, range: CandleRange): Candle[] {
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

async function fetchGecko(contract: string, range: CandleRange): Promise<Candle[] | null> {
	const cfg = CONFIG[range];
	const url = new URL(`https://api.geckoterminal.com/api/v2/networks/bsc/tokens/${contract}/ohlcv/${cfg.unit}`);
	url.searchParams.set("aggregate", String(cfg.aggregate));
	url.searchParams.set("limit", String(cfg.limit));
	url.searchParams.set("currency", "usd");
	try {
		const res = await fetch(url, { next: { revalidate: 60 } });
		if (!res.ok) return null;
		const rows = ((await res.json()) as GeckoResponse).data?.attributes?.ohlcv_list ?? [];
		if (rows.length < 8) return null;
		return rows.map(([time, o, h, l, c, v]) => ({ t: time * 1000, o, h, l, c, v })).sort((a, b) => a.t - b.t);
	} catch {
		return null;
	}
}

export async function fetchCandleSeries(contract: string, range: CandleRange = "1h"): Promise<CandleSeries> {
	const candles = await fetchGecko(contract, range);
	if (candles) return { candles, source: "geckoterminal", note: "live OHLC from GeckoTerminal token endpoint" };
	return {
		candles: synthetic(contract, range),
		source: "synthetic",
		note: "synthetic OHLC, wires to live token candles when the pair has public history",
	};
}

export async function fetchCandles(contract: string, range: CandleRange = "1h"): Promise<Candle[]> {
	return (await fetchCandleSeries(contract, range)).candles;
}
