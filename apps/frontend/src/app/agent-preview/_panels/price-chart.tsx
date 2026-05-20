/**
 * <PriceChart>
 *
 * Wave T worker B. Token Price chart with inline KPI strip, time-range
 * tabs, recharts ComposedChart (area + volume bars), and a floating
 * last-price pill anchored to the right edge of the latest data point.
 *
 * All colors via CSS variables so it re-themes per agent through
 * --accent / --positive / --negative on the dashboard root.
 */

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
	Area,
	Bar,
	CartesianGrid,
	ComposedChart,
	ReferenceDot,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import type { Candle, CandleRange, CandleSeries } from "../lib/candles";
import { fetchCandleSeries } from "../lib/candles";
import { formatCompactUsd, formatPercent, formatTokenPrice } from "../lib/format";
import type { TokenMetrics } from "../lib/token";
import { MicroStat, Panel, Pulse } from "./_primitives";

// Time tab labels visible in the UI mapped to internal CandleRange keys.
// The lib only exposes a subset; reuse the same key where possible.
type TabKey = "1H" | "6H" | "24H" | "7D" | "30D" | "90D" | "ALL";
type Tab = { key: TabKey; range: CandleRange; takeLast: number | null };
const TABS: readonly Tab[] = [
	{ key: "1H", range: "1m", takeLast: 60 },
	{ key: "6H", range: "5m", takeLast: 72 },
	{ key: "24H", range: "1h", takeLast: 80 },
	{ key: "7D", range: "4h", takeLast: 96 },
	{ key: "30D", range: "1d", takeLast: 72 },
	{ key: "90D", range: "7d", takeLast: 84 },
	{ key: "ALL", range: "7d", takeLast: null },
] as const;
const DEFAULT_TAB: Tab = { key: "24H", range: "1h", takeLast: 80 };

type PriceChartProps = {
	token: TokenMetrics;
	candleSeries: CandleSeries;
};

function fmtTime(t: number, range: CandleRange): string {
	const d = new Date(t);
	if (range === "1m" || range === "5m" || range === "1h") {
		return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
	}
	if (range === "4h" || range === "1d") {
		const day = d.toLocaleString("en-US", { day: "2-digit", month: "short", timeZone: "UTC" });
		const hr = String(d.getUTCHours()).padStart(2, "0");
		return `${day} ${hr}:00`;
	}
	return d.toLocaleString("en-US", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function yTickFormatter(v: number): string {
	if (v >= 1) return `$${v.toFixed(2)}`;
	if (v >= 0.01) return `$${v.toFixed(4)}`;
	if (v >= 0.0001) return `$${v.toFixed(6)}`;
	return `$${v.toExponential(1)}`;
}

function PriceText({ value, className = "" }: { value: number; className?: string }) {
	const f = formatTokenPrice(value);
	if (f.subscript == null) {
		return <span className={className}>{f.display}</span>;
	}
	return (
		<span className={className}>
			{f.display}
			<sub className="ml-px text-[0.55em] tracking-normal">{f.subscript}</sub>
			{f.suffix}
		</span>
	);
}

export function PriceChart({ token, candleSeries }: PriceChartProps) {
	const [tab, setTab] = useState<TabKey>("24H");
	const [series, setSeries] = useState<CandleSeries>(candleSeries);
	const [loading, setLoading] = useState(false);
	const gradientId = useId();

	const activeTab: Tab = TABS.find((t) => t.key === tab) ?? DEFAULT_TAB;

	// Whenever the user picks a new tab we refetch with the matching range.
	// The first render with the default tab uses server-rendered candles so
	// we skip that round-trip via a ref.
	const firstRender = useRef(true);
	useEffect(() => {
		if (firstRender.current && tab === "24H") {
			firstRender.current = false;
			return;
		}
		firstRender.current = false;
		let cancelled = false;
		setLoading(true);
		fetchCandleSeries(token.contract, activeTab.range)
			.then((next) => {
				if (!cancelled) setSeries(next);
			})
			.catch(() => {
				/* keep previous series, no toast - graceful */
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [tab, activeTab.range, token.contract]);

	const data: Candle[] = useMemo(() => {
		if (activeTab.takeLast == null) return series.candles;
		return series.candles.slice(-activeTab.takeLast);
	}, [series.candles, activeTab.takeLast]);

	const last = data.at(-1);
	const livePrice = token.priceUsd > 0 ? token.priceUsd : (last?.c ?? 0);
	const up = token.change24h >= 0;

	const hi = useMemo(() => Math.max(...data.map((d) => d.h), token.priceUsd || 0), [data, token.priceUsd]);
	const lo = useMemo(
		() => Math.min(...data.map((d) => d.l), token.priceUsd || Number.POSITIVE_INFINITY),
		[data, token.priceUsd],
	);

	const isLive = series.source === "geckoterminal";

	return (
		<Panel noPad className="flex flex-col">
			{/* ── Header ─────────────────────────────────────────────── */}
			<div className="flex flex-col gap-4 p-4 md:p-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0">
						<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
							<Pulse tone={isLive ? "accent" : "negative"} />
							Token Price
							<span className="text-[var(--text-tertiary)]">/ {isLive ? "live" : "synthetic"}</span>
						</div>
						<div className="mt-2 flex flex-wrap items-baseline gap-3">
							<PriceText
								className="font-mono text-[34px] font-light tabular-nums text-[var(--text-primary)] md:text-[40px]"
								value={livePrice}
							/>
							<span
								className="font-mono text-[14px] tabular-nums"
								style={{ color: up ? "var(--positive)" : "var(--negative)" }}
							>
								{formatPercent(token.change24h)}
							</span>
						</div>
					</div>

					{/* ── KPI strip ──────────────────────────────────────── */}
					<div className="grid grid-cols-3 gap-x-6 gap-y-3 sm:grid-cols-5">
						<MicroStat label="Market Cap" value={formatCompactUsd(token.marketCap)} />
						<MicroStat
							label="FDV"
							value={formatCompactUsd(
								token.marketCap > 0
									? token.marketCap
									: token.priceUsd * Number(token.totalSupply / 1_000_000_000_000_000_000n || 0n),
							)}
						/>
						<MicroStat label="24H High" value={yTickFormatter(hi)} />
						<MicroStat label="24H Low" value={yTickFormatter(Number.isFinite(lo) ? lo : 0)} />
						<MicroStat label="Volume (24H)" value={formatCompactUsd(token.volume24h)} />
					</div>
				</div>

				{/* ── Time tabs ──────────────────────────────────────── */}
				<div className="flex items-center justify-between gap-3">
					<div className="inline-flex items-center rounded-md border border-[var(--border-soft)] bg-white/[0.015] p-0.5">
						{TABS.map((t) => {
							const active = t.key === tab;
							return (
								<button
									className={
										active
											? "rounded-[5px] bg-[var(--accent-soft)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]"
											: "rounded-[5px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
									}
									key={t.key}
									onClick={() => setTab(t.key)}
									type="button"
								>
									{t.key}
								</button>
							);
						})}
					</div>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						{loading ? "syncing pool ohlc" : isLive ? "geckoterminal · pcs pool" : "synthetic seed"}
					</span>
				</div>
			</div>

			{/* ── Chart ──────────────────────────────────────────────── */}
			<div className="relative h-[340px] w-full">
				<ResponsiveContainer height="100%" width="100%">
					<ComposedChart data={data} margin={{ top: 8, right: 76, bottom: 4, left: 8 }}>
						<defs>
							<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
								<stop offset="65%" stopColor="var(--accent)" stopOpacity={0.04} />
								<stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
							</linearGradient>
						</defs>
						<CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="0" vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="t"
							domain={["dataMin", "dataMax"]}
							minTickGap={48}
							tick={{
								fill: "rgba(255,255,255,0.32)",
								fontFamily: "var(--font-geist-mono, monospace)",
								fontSize: 10,
							}}
							tickFormatter={(v) => fmtTime(Number(v), activeTab.range)}
							tickLine={false}
							type="number"
						/>
						<YAxis
							axisLine={false}
							dataKey="c"
							domain={["dataMin", "dataMax"]}
							orientation="right"
							tick={{
								fill: "rgba(255,255,255,0.32)",
								fontFamily: "var(--font-geist-mono, monospace)",
								fontSize: 10,
							}}
							tickCount={6}
							tickFormatter={yTickFormatter}
							tickLine={false}
							width={70}
							yAxisId="price"
						/>
						<YAxis dataKey="v" hide yAxisId="volume" />
						<Tooltip
							contentStyle={{
								background: "var(--bg-panel-hi)",
								border: "1px solid var(--border-mid)",
								borderRadius: 4,
								color: "var(--text-primary)",
								fontFamily: "var(--font-geist-mono, monospace)",
								fontSize: 11,
								padding: "8px 10px",
							}}
							cursor={{ stroke: "rgba(255,255,255,0.18)", strokeDasharray: "3 3" }}
							formatter={(value, name) => {
								if (name === "Volume") return [formatCompactUsd(Number(value)), "Volume"];
								return [yTickFormatter(Number(value)), "Price"];
							}}
							labelFormatter={(v) => new Date(Number(v)).toISOString().slice(0, 16).replace("T", " ")}
						/>
						<Bar
							dataKey="v"
							fill="rgba(255,255,255,0.12)"
							isAnimationActive={false}
							name="Volume"
							radius={[1, 1, 0, 0]}
							yAxisId="volume"
						/>
						<Area
							dataKey="c"
							dot={false}
							fill={`url(#${gradientId})`}
							isAnimationActive={false}
							name="Price"
							stroke="var(--accent)"
							strokeWidth={1.6}
							type="monotone"
							yAxisId="price"
						/>
						{last && (
							<ReferenceDot
								fill="var(--accent)"
								ifOverflow="extendDomain"
								r={3.5}
								stroke="var(--bg-panel)"
								strokeWidth={2}
								x={last.t}
								y={last.c}
								yAxisId="price"
							/>
						)}
					</ComposedChart>
				</ResponsiveContainer>

				{/* ── Floating last-price pill, anchored to the right edge ─ */}
				{last && (
					<div
						className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
						style={{
							top: `${priceToTopPct(last.c, data)}%`,
							transform: "translateY(-50%)",
						}}
					>
						<div
							className="flex items-center gap-1 rounded-[3px] px-2 py-0.5 font-mono text-[10px] tabular-nums shadow-[0_0_12px_rgba(0,0,0,0.4)]"
							style={{ background: "var(--accent)", color: "#000" }}
						>
							<PriceText value={last.c} />
						</div>
					</div>
				)}
			</div>
		</Panel>
	);
}

// Map a y value into a vertical % offset for the floating pill. The chart
// canvas top inset is 8px and the bottom margin is 4px out of 340. Close
// enough; the pill is decorative, the axis label below is the source of truth.
function priceToTopPct(price: number, data: Candle[]): number {
	if (data.length === 0) return 50;
	const min = Math.min(...data.map((d) => d.l));
	const max = Math.max(...data.map((d) => d.h));
	if (max === min) return 50;
	const ratio = (max - price) / (max - min);
	// account for ~2.5% top inset and ~1% bottom inset
	return 2.5 + ratio * 96.5;
}
