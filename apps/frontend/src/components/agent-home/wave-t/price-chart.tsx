/**
 * Price chart panel (Wave T worker B v2).
 *
 * Renders real OHLC candles using TradingView's lightweight-charts library
 * (already a project dep). Includes:
 *  - token symbol + big price + 24h change pill
 *  - time-range tabs (1H / 4H / 1D / 7D / 30D)
 *  - decorative drawing tool icons (line / ruler / expand)
 *  - candles with high/low wicks colored green/red
 *  - volume histogram below, color-matched to candle direction
 *  - floating last-price tag on the right edge (built into the lib)
 *
 * Source data: \`lib/candles.ts\` which fetches geckoterminal pools when
 * available and degrades to a deterministic synthetic series otherwise.
 */

"use client";

import NumberFlow from "@number-flow/react";
import {
	CandlestickSeries,
	ColorType,
	HistogramSeries,
	type IChartApi,
	type ISeriesApi,
	type Time,
	createChart,
} from "lightweight-charts";
import { ExpandIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { Candle, CandleRange, CandleSeries } from "@/lib/wave-t/candles";
import { fetchCandleSeries } from "@/lib/wave-t/candles";
import { formatChartPrice, pickChartPricePrecision } from "@/lib/wave-t/format";
import type { TokenMetrics } from "@/lib/wave-t/token";
import { Panel, Pulse } from "./_primitives";

const RANGE_TABS: { key: CandleRange; label: string }[] = [
	{ key: "1h", label: "1H" },
	{ key: "4h", label: "4H" },
	{ key: "1d", label: "1D" },
	{ key: "7d", label: "7D" },
];

/**
 * Pick the number of decimals NumberFlow should animate to for the big
 * header price. Mirrors formatChartPrice's magnitude buckets so the header
 * and Y-axis agree on precision: 2 for >= 1, 4 for >= 0.01, 6 for >= 0.0001,
 * 8 for everything smaller. NumberFlow tolerates trailing zeros on display
 * because Intl.NumberFormat is forgiving with minimumFractionDigits.
 */
function headerPriceDecimals(price: number): number {
	if (!Number.isFinite(price) || price <= 0) return 2;
	if (price >= 1) return 2;
	if (price >= 0.01) return 4;
	if (price >= 0.0001) return 6;
	return 8;
}

function toLwc(c: Candle) {
	return { time: Math.floor(c.t / 1000) as Time, open: c.o, high: c.h, low: c.l, close: c.c };
}
function toVol(c: Candle) {
	return {
		time: Math.floor(c.t / 1000) as Time,
		value: c.v,
		color: c.c >= c.o ? "rgba(109, 214, 104, 0.32)" : "rgba(255, 91, 91, 0.32)",
	};
}

export function PriceChart({
	token,
	initialSeries,
}: {
	token: TokenMetrics;
	initialSeries: CandleSeries;
}) {
	const [range, setRange] = useState<CandleRange>("1h");
	const [series, setSeries] = useState<CandleSeries>(initialSeries);
	const [loading, setLoading] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

	const candles = series.candles;
	const last = candles.at(-1);
	const price = token.priceUsd > 0 ? token.priceUsd : (last?.c ?? 0);
	const up = token.change24h >= 0;
	const priceDecimals = headerPriceDecimals(price);

	// fetch new range when user clicks a tab. initial range stays as the
	// SSR-prefetched series so the chart paints immediately.
	useEffect(() => {
		if (range === "1h" && series === initialSeries) return;
		let cancelled = false;
		setLoading(true);
		fetchCandleSeries(token.contract, range)
			.then((next) => {
				if (!cancelled) setSeries(next);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [range, token.contract, initialSeries, series]);

	// Live poll: the page is statically exported, so without this the
	// chart freezes at the build-time snapshot. Refresh the current
	// range every 30s; geckoterminal caches ~60s so this is conservative.
	useEffect(() => {
		if (!token.contract) return;
		let cancelled = false;
		const tick = async () => {
			const next = await fetchCandleSeries(token.contract, range);
			if (!cancelled && next.candles.length > 0) setSeries(next);
		};
		const id = window.setInterval(tick, 30_000);
		return () => {
			cancelled = true;
			window.clearInterval(id);
		};
	}, [range, token.contract]);

	// mount chart once
	useEffect(() => {
		if (!containerRef.current) return;
		const chart = createChart(containerRef.current, {
			autoSize: true,
			layout: {
				background: { type: ColorType.Solid, color: "transparent" },
				textColor: "rgba(255, 255, 255, 0.45)",
				fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
				fontSize: 10,
			},
			localization: {
				// Drives Y-axis tick labels and crosshair tooltips. Per-series
				// priceFormat below additionally controls the floating last-price
				// pill on the right edge.
				priceFormatter: formatChartPrice,
			},
			grid: {
				vertLines: { color: "rgba(255, 255, 255, 0.04)" },
				horzLines: { color: "rgba(255, 255, 255, 0.04)" },
			},
			rightPriceScale: {
				borderColor: "rgba(255, 255, 255, 0.05)",
				scaleMargins: { top: 0.08, bottom: 0.28 },
			},
			timeScale: {
				borderColor: "rgba(255, 255, 255, 0.05)",
				timeVisible: true,
				secondsVisible: false,
			},
			crosshair: {
				horzLine: { color: "rgba(0, 255, 135, 0.4)", labelBackgroundColor: "#0b0b0e" },
				vertLine: { color: "rgba(0, 255, 135, 0.4)", labelBackgroundColor: "#0b0b0e" },
			},
			handleScroll: false,
			handleScale: false,
		});

		const c = chart.addSeries(CandlestickSeries, {
			upColor: "#6dd668",
			downColor: "#ff5b5b",
			wickUpColor: "#6dd668",
			wickDownColor: "#ff5b5b",
			borderVisible: false,
			priceLineColor: "#00ff87",
			priceLineWidth: 1,
			// Initial precision; refined per series load below once we know
			// the actual candle magnitudes.
			priceFormat: { type: "price", precision: 2, minMove: 0.01 },
		});

		const v = chart.addSeries(HistogramSeries, {
			priceFormat: { type: "volume" },
			priceScaleId: "vol",
			color: "rgba(109, 214, 104, 0.32)",
		});
		chart.priceScale("vol").applyOptions({
			scaleMargins: { top: 0.78, bottom: 0 },
		});

		chartRef.current = chart;
		candleRef.current = c;
		volumeRef.current = v;

		return () => {
			chart.remove();
			chartRef.current = null;
			candleRef.current = null;
			volumeRef.current = null;
		};
	}, []);

	// push data whenever series changes
	useEffect(() => {
		if (!candleRef.current || !volumeRef.current) return;
		// Refine candle priceFormat to match the magnitude of the current
		// dataset. Small-cap tokens (price < $0.01) otherwise show $0.00 on
		// the right-edge price line and crosshair label.
		const sample = candles.at(-1)?.c ?? price;
		const { precision, minMove } = pickChartPricePrecision(sample);
		candleRef.current.applyOptions({
			priceFormat: { type: "price", precision, minMove },
		});
		candleRef.current.setData(candles.map(toLwc));
		volumeRef.current.setData(candles.map(toVol));
		chartRef.current?.timeScale().fitContent();
	}, [candles, price]);

	const sourceLabel = useMemo(
		() =>
			series.source === "geckoterminal"
				? "live OHLC · geckoterminal"
				: "synthetic OHLC · live when pool depth ≥ 8 bars",
		[series.source],
	);

	return (
		<Panel className="flex h-full min-h-[440px] flex-col" noPad>
			<header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-soft)] p-4">
				<div className="min-w-0">
					<div className="flex items-baseline gap-2.5">
						<span className="font-mono text-[15px] text-[var(--text-primary)]">{token.symbol || "–"}</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">/ USD</span>
					</div>
					<div className="mt-1.5 flex flex-wrap items-end gap-3">
						<div className="font-sans text-[34px] font-light leading-none text-[var(--text-primary)] tabular-nums md:text-[40px]">
							{price > 0 ? (
								<NumberFlow
									format={{
										style: "currency",
										currency: "USD",
										minimumFractionDigits: priceDecimals,
										maximumFractionDigits: priceDecimals,
									}}
									locales="en-US"
									value={price}
								/>
							) : (
								<span>{formatChartPrice(price)}</span>
							)}
						</div>
						<div
							className={cn(
								"mb-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums",
								up
									? "border-[var(--positive)]/30 bg-[var(--positive)]/10 text-[var(--positive)]"
									: "border-[var(--negative)]/30 bg-[var(--negative)]/10 text-[var(--negative)]",
							)}
						>
							<Pulse tone={up ? "positive" : "negative"} />
							{up ? "+" : ""}
							{token.change24h.toFixed(2)}%<span className="text-[var(--text-tertiary)]">24h</span>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-0.5 rounded-md border border-[var(--border-soft)] bg-black/20 p-0.5">
						{RANGE_TABS.map((tab) => (
							<button
								className={cn(
									"rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
									range === tab.key
										? "bg-[var(--accent-soft)] text-[var(--accent)]"
										: "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
								)}
								key={tab.key}
								onClick={() => setRange(tab.key)}
								type="button"
							>
								{tab.label}
							</button>
						))}
					</div>
					{/* Drawing-tool toolbar (line / ruler / expand) deferred — the
					    underlying chart library doesn't expose handlers yet, and
					    rendering inert buttons here looked broken. Restore when
					    the chart API is ready. */}
				</div>
			</header>
			<div className="relative flex-1 px-2 pb-2 pt-1">
				<div aria-busy={loading} className="absolute inset-x-2 inset-y-1 min-h-[300px]" ref={containerRef} />
				{loading && (
					<div className="pointer-events-none absolute right-4 top-3 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						loading…
					</div>
				)}
			</div>
			<footer className="flex items-center justify-between border-t border-[var(--border-soft)] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<span className="inline-flex items-center gap-1.5">
					<ExpandIcon className="h-2.5 w-2.5" />
					{sourceLabel}
				</span>
				<span>volume usd</span>
			</footer>
		</Panel>
	);
}

export default PriceChart;
