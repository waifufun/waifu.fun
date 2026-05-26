/**
 * P&L chart panel (Wave T worker B v2).
 *
 * Area chart of nav delta over the rolling window. When the caller
 * supplies a `series`, we render it; until a snapshot table exists
 * upstream there is no series to render and the panel surfaces an
 * honest empty state (no chart at all) rather than a flat-zero line
 * that masquerades as data.
 *
 * Header label: shows "p&l (Nd)" where N is the elapsed days inferred
 * from the series span, capped at 30. Sol just launched, so a fresh
 * agent shows "p&l (3d)" instead of pretending it has 30 days.
 *
 * Header right: total nav delta (signed $) + percentage delta vs
 * baseline (first observed nav). Tone (positive / negative / neutral)
 * applies to both the line color and the numeric chips so they always
 * agree.
 *
 * Body: AreaChart when data; otherwise centered empty notice.
 */

"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";

import { Label, Panel } from "./_primitives";

type Point = { t: number; pnl: number };

function fmtUsdShort(v: number): string {
	if (!Number.isFinite(v)) return "$0";
	const abs = Math.abs(v);
	const sign = v < 0 ? "-" : "";
	if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
	if (abs >= 1) return `${sign}$${abs.toFixed(0)}`;
	return `${sign}$${abs.toFixed(2)}`;
}

function fmtUsdSigned(v: number): string {
	if (!Number.isFinite(v) || v === 0) return "$0.00";
	const sign = v > 0 ? "+" : "-";
	const abs = Math.abs(v);
	return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDayTick(ms: number): string {
	const d = new Date(ms);
	return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function PnlChart({ series, baselineNav }: { series?: Point[]; baselineNav?: number | null }) {
	const hasData = Array.isArray(series) && series.length > 0;
	const data = useMemo(() => series ?? [], [series]);
	const total = useMemo(() => {
		if (!hasData) return 0;
		// `series` already carries `pnl = nav[i] - nav[0]`, so the latest
		// point is the full window delta. Subtracting the first point's
		// pnl (always 0 by construction) is a no-op but kept for clarity.
		return (data.at(-1)?.pnl ?? 0) - (data.at(0)?.pnl ?? 0);
	}, [data, hasData]);
	// Percentage delta vs baseline. When baselineNav is not provided we
	// can still derive it from the series: the first point has pnl=0,
	// which means baseline = (any nav at index 0). But the series itself
	// strips nav, so we accept a baselineNav prop. Falls back to 0 when
	// baseline is unknown or non-positive (avoids divide-by-zero and a
	// nonsensical percentage on freshly-funded agents).
	const pct = useMemo(() => {
		if (!hasData) return 0;
		if (typeof baselineNav === "number" && baselineNav > 0) {
			return (total / baselineNav) * 100;
		}
		return 0;
	}, [hasData, total, baselineNav]);

	// Window label: honest elapsed-days count from the first to last
	// snapshot, capped at 30. "30D" was lying for fresh agents.
	const windowLabel = useMemo(() => {
		if (!hasData) return "30d";
		const first = data[0]?.t;
		const last = data.at(-1)?.t;
		if (!first || !last || last <= first) return "30d";
		const days = Math.max(1, Math.min(30, Math.round((last - first) / 86_400_000)));
		return `${days}d`;
	}, [hasData, data]);

	const tone = total > 0 ? "positive" : total < 0 ? "negative" : "neutral";
	const strokeColor =
		tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : "var(--accent)";

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					hasData ? (
						<span
							className={cn(
								"inline-flex items-center gap-2 font-mono text-[11px] tabular-nums",
								tone === "positive"
									? "text-[var(--positive)]"
									: tone === "negative"
										? "text-[var(--negative)]"
										: "text-[var(--text-secondary)]",
							)}
						>
							<span>{total === 0 ? "+$0.00" : fmtUsdSigned(total)}</span>
							<span className="text-[var(--text-tertiary)]">
								{pct > 0 ? "+" : ""}
								{pct.toFixed(2)}%
							</span>
						</span>
					) : (
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							awaiting data
						</span>
					)
				}
			>
				p&amp;l ({windowLabel})
			</Label>

			{hasData ? (
				<div className="-mx-1 h-[170px] flex-1">
					<ResponsiveContainer height="100%" width="100%">
						<AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
							<defs>
								<linearGradient id="pnl-fill" x1="0" x2="0" y1="0" y2="1">
									<stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
									<stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
								</linearGradient>
							</defs>
							<CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
							<XAxis
								axisLine={false}
								dataKey="t"
								minTickGap={32}
								tick={{
									fill: "rgba(255,255,255,0.32)",
									fontFamily: "var(--font-geist-mono, monospace)",
									fontSize: 9,
								}}
								tickFormatter={fmtDayTick}
								tickLine={false}
								type="number"
								domain={["dataMin", "dataMax"]}
							/>
							<YAxis
								axisLine={false}
								tick={{
									fill: "rgba(255,255,255,0.32)",
									fontFamily: "var(--font-geist-mono, monospace)",
									fontSize: 9,
								}}
								tickFormatter={fmtUsdShort}
								tickLine={false}
								width={44}
								domain={["dataMin - 1", "dataMax + 1"]}
							/>
							<Tooltip
								contentStyle={{
									background: "var(--bg-panel)",
									border: "1px solid var(--border-mid)",
									borderRadius: 4,
									color: "var(--text-primary)",
									fontFamily: "var(--font-geist-mono, monospace)",
									fontSize: 11,
								}}
								formatter={(v) => [fmtUsdSigned(Number(v)), "pnl"]}
								labelFormatter={(v) => new Date(Number(v)).toISOString().slice(0, 10)}
							/>
							<Area
								dataKey="pnl"
								fill="url(#pnl-fill)"
								isAnimationActive={false}
								stroke={strokeColor}
								strokeWidth={1.5}
								type="monotone"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			) : (
				<div className="flex h-[88px] flex-1 flex-col items-start justify-center gap-1 py-2">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						no pnl history yet
					</span>
					<span className="font-mono text-[11px] text-[var(--text-tertiary)]/70">
						snapshots accumulate hourly · 30d window unlocks at hour 720
					</span>
				</div>
			)}

			{hasData ? (
				<footer className="mt-2 border-t border-[var(--border-soft)] pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					live pnl · tracking {windowLabel} of nav
				</footer>
			) : null}
		</Panel>
	);
}

export default PnlChart;
