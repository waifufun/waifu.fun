/**
 * Price chart panel.
 *
 * Multi-timeframe candle chart with live polling per range, crosshair
 * tooltip showing OHLCV at the hover position, last-price line on the
 * right edge, and an honest empty state when the pool has no public
 * OHLCV yet.
 *
 * Range pills (5m / 15m / 1h / 4h / 1d / all) map directly to the
 * geckoterminal `(unit, aggregate, limit)` triples defined in
 * `lib/wave-t/candles.ts`. Each range polls on its own cadence:
 *
 *   5m, 15m  - every 15s
 *   1h       - every 30s
 *   4h+      - every 60s
 *
 * The chart caches the last good series per range so toggling between
 * timeframes does not flash an empty chart while a new fetch is in
 * flight. The initial range (1h) is server-rendered; everything else
 * is fetched on demand and cached.
 *
 * Underlying lib: TradingView's lightweight-charts (already a dep).
 */

"use client";

import NumberFlow from "@number-flow/react";
import {
	CandlestickSeries,
	ColorType,
	HistogramSeries,
	type IChartApi,
	type ISeriesApi,
	type MouseEventParams,
	type Time,
	createChart,
} from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScrambleText } from "@/lib/motion-plus/scramble-text";
import { cn } from "@/lib/utils";

import type { Candle, CandleRange, CandleSeries } from "@/lib/wave-t/candles";
import { candleRangePollMs, candleRangeWindowLabel, fetchCandleSeries } from "@/lib/wave-t/candles";
import { formatChartPrice, formatCompactUsd, pickChartPricePrecision } from "@/lib/wave-t/format";
import type { TokenMetrics } from "@/lib/wave-t/token";
import { Panel, Pulse } from "./_primitives";

const RANGE_TABS: { key: CandleRange; label: string }[] = [
	{ key: "5m", label: "5m" },
	{ key: "15m", label: "15m" },
	{ key: "1h", label: "1h" },
	{ key: "4h", label: "4h" },
	{ key: "1d", label: "1d" },
	{ key: "all", label: "all" },
];

/**
 * Decimal precision for the big header price + crosshair tooltip.
 * Matches formatChartPrice's magnitude buckets so the header and Y-axis
 * agree.
 */
function priceDecimalsFor(price: number): number {
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

/**
 * Compute % change across the visible candle series. Uses first open
 * vs last close so the number reflects "how much did this range
 * move" rather than the upstream 24h ticker (which is a separate
 * metric shown elsewhere).
 */
function rangeChangePct(candles: Candle[]): number {
	if (candles.length < 2) return 0;
	const first = candles[0];
	const last = candles[candles.length - 1];
	if (!first || !last || first.o <= 0) return 0;
	return ((last.c - first.o) / first.o) * 100;
}

function totalVolumeUsd(candles: Candle[]): number {
	let sum = 0;
	for (const c of candles) sum += c.v;
	return sum;
}

function formatTooltipTime(seconds: number, range: CandleRange): string {
	const d = new Date(seconds * 1000);
	if (range === "1d" || range === "all") {
		// "may 22, 2026"
		return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toLowerCase();
	}
	if (range === "4h") {
		// "may 22 · 14:00"
		const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
		const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
		return `${date} · ${time}`;
	}
	// 5m / 15m / 1h
	const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
	const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
	return `${date} · ${time}`;
}

type HoverState = {
	o: number;
	h: number;
	l: number;
	c: number;
	v: number;
	timeLabel: string;
};

export function PriceChart({
	token,
	initialSeries,
}: {
	token: TokenMetrics;
	initialSeries: CandleSeries;
}) {
	const [range, setRange] = useState<CandleRange>("1h");

	// Per-range cache so swapping timeframes does not flash empty.
	// Seeded with the SSG-rendered 1h series.
	const cacheRef = useRef<Map<CandleRange, CandleSeries>>(new Map([["1h", initialSeries]]));
	const [series, setSeries] = useState<CandleSeries>(initialSeries);
	const [loading, setLoading] = useState(false);
	const [hover, setHover] = useState<HoverState | null>(null);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);

	const candles = series.candles;
	const last = candles.at(-1);
	const headerPrice = token.priceUsd > 0 ? token.priceUsd : (last?.c ?? 0);
	const headerDecimals = priceDecimalsFor(headerPrice);

	// % change pill prefers the 24h ticker (so the headline number lines
	// up with what the rest of the page says); the range-change figure
	// gets its own footer cell.
	const ticker24hUp = token.change24h >= 0;
	const rangeChange = useMemo(() => rangeChangePct(candles), [candles]);
	const rangeUp = rangeChange >= 0;
	const rangeVol = useMemo(() => totalVolumeUsd(candles), [candles]);

	// ── range switching + polling ───────────────────────────────

	const fetchForRange = useCallback(
		async (r: CandleRange, opts: { background?: boolean } = {}) => {
			if (!opts.background) setLoading(true);
			try {
				const next = await fetchCandleSeries(token.contract, r);
				// Never overwrite a good cached series with an empty one if
				// the previous fetch had candles. Empty only wins when we
				// have no prior data.
				const prev = cacheRef.current.get(r);
				if (next.candles.length === 0 && prev && prev.candles.length > 0) return;
				cacheRef.current.set(r, next);
				// Only push to state if the user is still on this range.
				setSeries((current) => (r === currentRangeRef.current ? next : current));
			} catch {
				// swallow; preserve previous good state
			} finally {
				if (!opts.background) setLoading(false);
			}
		},
		[token.contract],
	);

	const currentRangeRef = useRef<CandleRange>(range);
	useEffect(() => {
		currentRangeRef.current = range;
	}, [range]);

	// When the user changes range, render the cached series instantly
	// (if any) and kick a fresh fetch in the foreground.
	useEffect(() => {
		const cached = cacheRef.current.get(range);
		if (cached) {
			setSeries(cached);
			if (range === "1h" && cached === initialSeries) {
				// SSG snapshot already on screen; a background poll will
				// refresh shortly. No foreground fetch needed.
				return;
			}
		}
		void fetchForRange(range);
	}, [range, fetchForRange, initialSeries]);

	// Background polling at the per-range cadence. The interval is
	// recomputed on range change so 5m polls every 15s, 1d every 60s.
	useEffect(() => {
		const intervalMs = candleRangePollMs(range);
		const id = window.setInterval(() => {
			void fetchForRange(range, { background: true });
		}, intervalMs);
		return () => window.clearInterval(id);
	}, [range, fetchForRange]);

	// ── chart mount ─────────────────────────────────────────────

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
			priceLineStyle: 2, // dashed
			lastValueVisible: true,
			priceFormat: { type: "price", precision: 2, minMove: 0.01 },
		});

		const v = chart.addSeries(HistogramSeries, {
			priceFormat: { type: "volume" },
			priceScaleId: "vol",
			color: "rgba(109, 214, 104, 0.32)",
			lastValueVisible: false,
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

	// Crosshair subscription. Stays attached for the lifetime of the
	// chart; reads the candle the cursor is over and stages it for the
	// floating tooltip. Pushing data into the chart later does not
	// invalidate this subscription because lightweight-charts looks up
	// values by time on every move.
	useEffect(() => {
		const chart = chartRef.current;
		const candleSeries = candleRef.current;
		const volSeries = volumeRef.current;
		if (!chart || !candleSeries || !volSeries) return;
		const handler = (param: MouseEventParams) => {
			if (!param.time || !param.point) {
				setHover(null);
				return;
			}
			const candle = param.seriesData.get(candleSeries) as
				| { open: number; high: number; low: number; close: number }
				| undefined;
			const vol = param.seriesData.get(volSeries) as { value: number } | undefined;
			if (!candle) {
				setHover(null);
				return;
			}
			const seconds = typeof param.time === "number" ? param.time : 0;
			setHover({
				o: candle.open,
				h: candle.high,
				l: candle.low,
				c: candle.close,
				v: vol?.value ?? 0,
				timeLabel: formatTooltipTime(seconds, currentRangeRef.current),
			});
		};
		chart.subscribeCrosshairMove(handler);
		return () => {
			chart.unsubscribeCrosshairMove(handler);
		};
	}, []);

	// Push data + refine precision whenever the series changes.
	useEffect(() => {
		if (!candleRef.current || !volumeRef.current || !chartRef.current) return;
		const sample = candles.at(-1)?.c ?? headerPrice;
		const { precision, minMove } = pickChartPricePrecision(sample);
		candleRef.current.applyOptions({
			priceFormat: { type: "price", precision, minMove },
		});
		// lightweight-charts asserts strictly-ascending unique times. Upstream
		// candle batches occasionally carry two rows in the same second (e.g.
		// a backfill row landing on a live row); collapse those to the last
		// write so the assertion never trips and the whole page never white-
		// screens on a duplicate timestamp.
		const seenSec = new Set<number>();
		const dedupedAsc: Candle[] = [];
		for (const c of [...candles].sort((a, b) => a.t - b.t)) {
			const sec = Math.floor(c.t / 1000);
			if (seenSec.has(sec)) {
				dedupedAsc[dedupedAsc.length - 1] = c;
				continue;
			}
			seenSec.add(sec);
			dedupedAsc.push(c);
		}
		candleRef.current.setData(dedupedAsc.map(toLwc));
		volumeRef.current.setData(dedupedAsc.map(toVol));
		chartRef.current.timeScale().fitContent();
	}, [candles, headerPrice]);

	const hasData = candles.length > 0;
	const isEmpty = !hasData && series.source === "empty";

	const footerSourceLabel =
		series.source === "geckoterminal"
			? `live · geckoterminal · ${candleRangeWindowLabel(range)}`
			: series.source === "empty"
				? "candles indexing"
				: `synthetic · ${candleRangeWindowLabel(range)}`;

	return (
		<Panel className="flex h-full min-h-[440px] flex-col" noPad>
			<header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-soft)] p-4">
				<div className="min-w-0">
					<div className="flex items-baseline gap-2.5">
						<span className="font-mono text-[15px] text-[var(--text-primary)]">{token.symbol || "–"}</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">/ usd</span>
					</div>
					<div className="mt-1.5 flex flex-wrap items-end gap-3">
						<div className="font-sans text-[34px] font-light leading-none text-[var(--text-primary)] tabular-nums md:text-[40px]">
							{headerPrice > 0 ? (
								<NumberFlow
									format={{
										style: "currency",
										currency: "USD",
										minimumFractionDigits: headerDecimals,
										maximumFractionDigits: headerDecimals,
									}}
									locales="en-US"
									value={headerPrice}
								/>
							) : (
								<span>{formatChartPrice(headerPrice)}</span>
							)}
						</div>
						<div
							className={cn(
								"mb-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums",
								ticker24hUp
									? "border-[var(--positive)]/30 bg-[var(--positive)]/10 text-[var(--positive)]"
									: "border-[var(--negative)]/30 bg-[var(--negative)]/10 text-[var(--negative)]",
							)}
						>
							<Pulse tone={ticker24hUp ? "positive" : "negative"} />
							<ScrambleText duration={0.3} interval={0.04} chars="0123456789+-.">
								{`${ticker24hUp ? "+" : ""}${token.change24h.toFixed(2)}%`}
							</ScrambleText>
							<span className="text-[var(--text-tertiary)]">24h</span>
						</div>
					</div>
				</div>
				<div className="flex flex-col items-end gap-2">
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
					{loading ? (
						<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">loading</span>
					) : null}
				</div>
			</header>
			<div className="relative flex-1 px-2 pb-2 pt-1">
				<div aria-busy={loading} className="absolute inset-x-2 inset-y-1 min-h-[300px]" ref={containerRef} />
				{isEmpty ? (
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
						<span className="text-[var(--text-secondary)]">candles indexing</span>
						<span>check back in a few minutes</span>
					</div>
				) : null}
				{hover && hasData ? <CrosshairTooltip hover={hover} /> : null}
			</div>
			<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				<span className="inline-flex items-center gap-1.5">
					<Pulse tone="accent" />
					{footerSourceLabel}
				</span>
				<span className="flex items-center gap-4">
					<span>
						<span className="text-[var(--text-tertiary)]">{range} chg</span>{" "}
						<ScrambleText
							as="span"
							duration={0.25}
							interval={0.04}
							chars="0123456789+-."
							className={cn("tabular-nums", rangeUp ? "text-[var(--positive)]" : "text-[var(--negative)]")}
						>
							{`${rangeUp ? "+" : ""}${rangeChange.toFixed(2)}%`}
						</ScrambleText>
					</span>
					<span>
						<span className="text-[var(--text-tertiary)]">{range} vol</span>{" "}
						<span className="tabular-nums text-[var(--text-secondary)]">{formatCompactUsd(rangeVol)}</span>
					</span>
				</span>
			</footer>
		</Panel>
	);
}

/**
 * Floating OHLCV readout pinned to the top-left of the chart. Plain
 * mono row of o/h/l/c/v with the timestamp underneath. No background
 * box, no shadows; the values just sit there like a tape printout.
 */
function CrosshairTooltip({ hover }: { hover: HoverState }) {
	const up = hover.c >= hover.o;
	return (
		<div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-col gap-0.5 font-mono text-[10px] tabular-nums">
			<div className="flex items-center gap-3 text-[var(--text-secondary)]">
				<TooltipCell label="o" value={formatChartPrice(hover.o)} />
				<TooltipCell label="h" value={formatChartPrice(hover.h)} tone="positive" />
				<TooltipCell label="l" value={formatChartPrice(hover.l)} tone="negative" />
				<TooltipCell label="c" value={formatChartPrice(hover.c)} tone={up ? "positive" : "negative"} />
				<TooltipCell label="v" value={formatCompactUsd(hover.v)} />
			</div>
			<span className="text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{hover.timeLabel}</span>
		</div>
	);
}

function TooltipCell({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: "positive" | "negative";
}) {
	const cls =
		tone === "positive"
			? "text-[var(--positive)]"
			: tone === "negative"
				? "text-[var(--negative)]"
				: "text-[var(--text-primary)]";
	return (
		<span className="inline-flex items-center gap-1">
			<span className="text-[var(--text-tertiary)]">{label}</span>
			<span className={cls}>{value}</span>
		</span>
	);
}

export default PriceChart;
