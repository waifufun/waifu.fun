/**
 * P&L chart panel (Wave T) — Hyperliquid trading PnL, rebuilt.
 *
 * This panel renders the agent's REAL trading pnl, sourced from the api's
 * /v2/agents/:address/hyperliquid/pnl route via `fetchHyperliquidPnl`.
 *
 * What changed (and why):
 *   - HL-ONLY. The series is Hyperliquid's own deposit-adjusted pnlHistory,
 *     not a nav diff. The old chart did `pnl = nav[i] - nav[0]`, which folds
 *     deposits straight into pnl (a $2k deposit looked like +$2k profit).
 *   - DEPOSIT-EXCLUDED by default. The headline number is trading pnl; the
 *     account value (which includes deposits) is shown as its own muted stat.
 *   - BASELINE ANCHORED. The series is anchored at first real activity
 *     (leading flat 0.0 points dropped) so the line starts where trading did.
 *   - PRIOR WALLET folded into lifetime stats. If the agent rotated HL
 *     wallets, the abandoned wallet's realized pnl is added to the total and
 *     surfaced in the footer.
 *   - TAX INCOME SEPARATE. Tax-stream income is its own chip, never summed
 *     into trading pnl.
 *
 * Back-compat: still accepts the legacy `series` / `baselineNav` props so
 * callers that have not migrated keep rendering (treated as a deposit-naive
 * fallback). New callers pass `hlPnl`.
 */

"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import type { HlPnlData, PnlSeriesPoint } from "@/lib/wave-t/pnl";

import { Label, Panel } from "./_primitives";

type Point = PnlSeriesPoint;

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

function fmtUsdPlain(v: number): string {
	if (!Number.isFinite(v)) return "$0";
	const abs = Math.abs(v);
	const sign = v < 0 ? "-" : "";
	return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDayTick(ms: number): string {
	const d = new Date(ms);
	return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function shortAddr(addr: string): string {
	return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/**
 * Tax income is raw token wei (numeric string, 18 decimals assumed). We
 * only render it when nonzero; until fees flow it stays at $0 / hidden so
 * the panel never invents revenue. Returns a display string or null.
 */
function taxDisplay(amountWei: string): string | null {
	if (!amountWei || amountWei === "0") return null;
	try {
		const big = BigInt(amountWei);
		if (big === 0n) return null;
		// 18-decimal token units → human float (display only, not accounting).
		const whole = big / 10n ** 18n;
		const frac = (big % 10n ** 18n) / 10n ** 14n; // 4 dp
		return `${whole.toString()}.${frac.toString().padStart(4, "0")}`;
	} catch {
		return null;
	}
}

export interface PnlChartProps {
	/** Preferred: HL-only deposit-excluded payload from fetchHyperliquidPnl. */
	hlPnl?: HlPnlData | null;
	/** @deprecated legacy nav-diff series. Used only when hlPnl is absent. */
	series?: Point[];
	/** @deprecated legacy baseline nav for percent. Unused with hlPnl. */
	baselineNav?: number | null;
}

export function PnlChart({ hlPnl, series, baselineNav }: PnlChartProps) {
	// Prefer the HL payload; fall back to the legacy series for unmigrated callers.
	const data = useMemo<Point[]>(() => {
		if (hlPnl) return hlPnl.series;
		return series ?? [];
	}, [hlPnl, series]);
	const hasData = data.length > 0;

	// Headline = lifetime trading pnl (deposit-excluded, current + prior
	// wallets) when we have the HL payload. Legacy path falls back to the
	// last series point (nav delta) so old callers still show something.
	const headlineTotal = useMemo(() => {
		if (hlPnl) return hlPnl.tradingPnl.total;
		if (!hasData) return 0;
		return data.at(-1)?.pnl ?? 0;
	}, [hlPnl, hasData, data]);

	// Percentage: trading pnl vs account value (deposit-inclusive capital
	// base) for the HL path. Legacy path uses the supplied baselineNav.
	const pct = useMemo(() => {
		if (hlPnl) {
			const base = hlPnl.accountValue;
			return base > 0 ? (hlPnl.tradingPnl.total / base) * 100 : 0;
		}
		if (!hasData) return 0;
		if (typeof baselineNav === "number" && baselineNav > 0) {
			return ((data.at(-1)?.pnl ?? 0) / baselineNav) * 100;
		}
		return 0;
	}, [hlPnl, hasData, data, baselineNav]);

	const windowLabel = useMemo(() => {
		if (hlPnl) {
			switch (hlPnl.window) {
				case "day":
					return "24h";
				case "week":
					return "7d";
				case "month":
					return "30d";
				default:
					return "all";
			}
		}
		if (!hasData) return "all";
		const first = data[0]?.t;
		const last = data.at(-1)?.t;
		if (!first || !last || last <= first) return "all";
		const days = Math.max(1, Math.min(30, Math.round((last - first) / 86_400_000)));
		return `${days}d`;
	}, [hlPnl, hasData, data]);

	const tone = headlineTotal > 0 ? "positive" : headlineTotal < 0 ? "negative" : "neutral";
	const strokeColor =
		tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : "var(--accent)";

	const priorPnl = hlPnl?.tradingPnl.priorWallets ?? 0;
	const hasPrior = (hlPnl?.priorWallets.length ?? 0) > 0 && Math.abs(priorPnl) > 1e-9;
	const tax = hlPnl ? taxDisplay(hlPnl.taxIncome.amountWei) : null;
	const winLoss = hlPnl?.winLoss ?? null;

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
							<span>{headlineTotal === 0 ? "+$0.00" : fmtUsdSigned(headlineTotal)}</span>
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
				trading p&amp;l ({windowLabel})
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
								formatter={(v) => [fmtUsdSigned(Number(v)), "trading pnl"]}
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
						no trading history yet
					</span>
					<span className="font-mono text-[11px] text-[var(--text-tertiary)]/70">
						hyperliquid pnl appears once the agent opens its first position
					</span>
				</div>
			)}

			{/* stats row — only on the HL path. trading pnl (current+prior),
			    account value, tax income (separate), win/loss. */}
			{hlPnl && hasData ? (
				<div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-[var(--border-soft)] pt-2 font-mono text-[10px] tabular-nums sm:grid-cols-4">
					<div className="flex flex-col gap-0.5">
						<span className="text-[8px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
							trading pnl
						</span>
						<span
							className={cn(
								tone === "positive"
									? "text-[var(--positive)]"
									: tone === "negative"
										? "text-[var(--negative)]"
										: "text-[var(--text-secondary)]",
							)}
						>
							{fmtUsdSigned(hlPnl.tradingPnl.total)}
						</span>
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="text-[8px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
							account value
						</span>
						<span className="text-[var(--text-secondary)]">{fmtUsdPlain(hlPnl.accountValue)}</span>
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="text-[8px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
							tax income
						</span>
						<span className="text-[var(--text-secondary)]">{tax ? tax : "$0.00"}</span>
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="text-[8px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
							win / loss
						</span>
						<span className="text-[var(--text-secondary)]">
							{winLoss ? `${winLoss.wins}w / ${winLoss.losses}l` : "—"}
						</span>
					</div>
				</div>
			) : null}

			{/* footer: provenance + prior-wallet disclosure. */}
			{hasData ? (
				<footer className="mt-2 border-t border-[var(--border-soft)] pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					{hlPnl ? (
						<span>
							hyperliquid · deposit-excluded · {windowLabel}
							{hasPrior ? (
								<span className="normal-case tracking-normal text-[var(--text-tertiary)]/80">
									{" "}
									· incl prior wallet {shortAddr(hlPnl.priorWallets[0] ?? "")} ({fmtUsdSigned(priorPnl)})
								</span>
							) : null}
						</span>
					) : (
						<span>live pnl · tracking {windowLabel} of nav</span>
					)}
				</footer>
			) : null}
		</Panel>
	);
}

export default PnlChart;
