/**
 * Generic data-view widgets for the schema-driven capability panel.
 *
 * Each widget renders one `CapabilityDataProvider` by its `render` hint:
 *   metric-grid    → account summary KPIs
 *   positions-table→ open perp positions
 *   line-chart     → pnl series
 *   income-card    → tax-income stream
 *   activity-feed / json → defensive fallbacks
 *
 * The widgets are deliberately venue-agnostic: they read the SAME loosely-typed
 * payloads the live HL routes return today, but never hardcode "hyperliquid".
 * A new venue whose endpoints return the same shapes renders for free. Every
 * widget is defensive (the payload is whatever the endpoint sends) and renders
 * an honest empty state rather than fake numbers.
 *
 * Styling matches the Wave T grammar (mono numbers, lowercase, #00ff87 accent).
 * No em-dashes in copy.
 */

"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

import { Hairline, MicroStat } from "@/components/agent-home/wave-t/_primitives";
import type { CapabilityDataProvider } from "@/lib/api/capabilities";
import { cn } from "@/lib/utils";

import { useCapabilityPoll } from "./use-capability-poller";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function fmtUsd(v: number): string {
	const sign = v < 0 ? "-" : "";
	const abs = Math.abs(v);
	if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}m`;
	if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}k`;
	return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtNum(v: number, digits = 4): string {
	return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function toneFor(v: number): "positive" | "negative" | "neutral" {
	if (v > 0) return "positive";
	if (v < 0) return "negative";
	return "neutral";
}

/** Shared empty/loading frame so each widget reads consistently. */
function WidgetState({ loading, empty, children }: { loading: boolean; empty: boolean; children: React.ReactNode }) {
	if (loading) {
		return <p className="font-mono text-[11px] text-[var(--text-tertiary)]">loading...</p>;
	}
	if (empty) {
		return <p className="font-mono text-[11px] text-[var(--text-tertiary)]">no data yet</p>;
	}
	return <>{children}</>;
}

// ── metric-grid: account summary KPIs ─────────────────────────────

function MetricGridWidget({ provider }: { provider: CapabilityDataProvider }) {
	const { data, loading, loaded } = useCapabilityPoll<Record<string, unknown>>(provider.endpoint);
	const accountValue = num(data?.accountValueUsd);
	const withdrawable = num(data?.withdrawableUsd);
	const positions = Array.isArray(data?.positions) ? (data?.positions as unknown[]).length : 0;
	const hasAny = loaded && (accountValue !== 0 || withdrawable !== 0 || positions !== 0);

	return (
		<WidgetState loading={loading && !loaded} empty={loaded && !hasAny}>
			<div className="grid grid-cols-3 gap-3">
				<MicroStat label="account value" value={fmtUsd(accountValue)} tone="accent" />
				<MicroStat label="withdrawable" value={fmtUsd(withdrawable)} />
				<MicroStat label="open positions" value={fmtNum(positions, 0)} />
			</div>
		</WidgetState>
	);
}

// ── positions-table: open perp positions ──────────────────────────

interface PositionRow {
	coin: string;
	side: string;
	size: number;
	leverage: number | null;
	notionalUsd: number;
	unrealizedPnlUsd: number;
}

function PositionsTableWidget({ provider }: { provider: CapabilityDataProvider }) {
	const { data, loading, loaded } = useCapabilityPoll<Record<string, unknown>>(provider.endpoint);
	const rows = useMemo<PositionRow[]>(() => {
		const raw = Array.isArray(data?.positions) ? (data?.positions as Record<string, unknown>[]) : [];
		return raw.map((p) => ({
			coin: str(p.coin),
			side: str(p.side),
			size: num(p.size),
			leverage: typeof p.leverage === "number" ? p.leverage : null,
			notionalUsd: num(p.notionalUsd),
			unrealizedPnlUsd: num(p.unrealizedPnlUsd),
		}));
	}, [data]);

	return (
		<WidgetState loading={loading && !loaded} empty={loaded && rows.length === 0}>
			<div className="overflow-x-auto">
				<table className="w-full text-left font-mono text-[11px] tabular-nums">
					<thead>
						<tr className="text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							<th className="pb-2 font-normal">market</th>
							<th className="pb-2 font-normal">side</th>
							<th className="pb-2 text-right font-normal">size</th>
							<th className="pb-2 text-right font-normal">notional</th>
							<th className="pb-2 text-right font-normal">upnl</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={`${r.coin}-${r.side}`} className="border-t border-[var(--border-soft)]">
								<td className="py-2 text-[var(--text-primary)]">{r.coin || "?"}</td>
								<td className={cn("py-2", r.side === "short" ? "text-[var(--negative)]" : "text-[var(--positive)]")}>
									{r.side || "-"}
									{r.leverage ? <span className="ml-1 text-[var(--text-tertiary)]">{r.leverage}x</span> : null}
								</td>
								<td className="py-2 text-right text-[var(--text-secondary)]">{fmtNum(r.size)}</td>
								<td className="py-2 text-right text-[var(--text-secondary)]">{fmtUsd(r.notionalUsd)}</td>
								<td
									className={cn(
										"py-2 text-right",
										r.unrealizedPnlUsd > 0
											? "text-[var(--positive)]"
											: r.unrealizedPnlUsd < 0
												? "text-[var(--negative)]"
												: "text-[var(--text-secondary)]",
									)}
								>
									{fmtUsd(r.unrealizedPnlUsd)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</WidgetState>
	);
}

// ── line-chart: pnl series ────────────────────────────────────────

interface SeriesPoint {
	t: number;
	pnl: number;
}

function LineChartWidget({ provider }: { provider: CapabilityDataProvider }) {
	// pnl is the most volatile read; poll a touch faster than the default.
	const { data, loading, loaded } = useCapabilityPoll<Record<string, unknown>>(provider.endpoint, 60_000);
	const series = useMemo<SeriesPoint[]>(() => {
		const raw = Array.isArray(data?.series) ? (data?.series as Record<string, unknown>[]) : [];
		return raw.map((p) => ({ t: num(p.t), pnl: num(p.pnl) })).filter((p) => Number.isFinite(p.pnl));
	}, [data]);

	const total = useMemo(() => {
		const tp = data?.tradingPnl as Record<string, unknown> | undefined;
		if (tp && typeof tp.total === "number") return tp.total;
		return series.at(-1)?.pnl ?? 0;
	}, [data, series]);

	const tone = toneFor(total);
	const stroke = tone === "negative" ? "var(--negative)" : "var(--accent)";

	return (
		<WidgetState loading={loading && !loaded} empty={loaded && series.length === 0}>
			<div className="flex items-baseline justify-between">
				<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					trading pnl
				</span>
				<span
					className={cn(
						"font-mono text-[15px] tabular-nums",
						tone === "positive"
							? "text-[var(--positive)]"
							: tone === "negative"
								? "text-[var(--negative)]"
								: "text-[var(--text-primary)]",
					)}
				>
					{total >= 0 ? "+" : ""}
					{fmtUsd(total)}
				</span>
			</div>
			<div className="mt-3 h-24 w-full">
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
						<defs>
							<linearGradient id={`cap-pnl-${provider.view}`} x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
								<stop offset="100%" stopColor={stroke} stopOpacity={0} />
							</linearGradient>
						</defs>
						<YAxis hide domain={["dataMin", "dataMax"]} />
						<Area
							type="monotone"
							dataKey="pnl"
							stroke={stroke}
							strokeWidth={1.5}
							fill={`url(#cap-pnl-${provider.view})`}
							isAnimationActive={false}
							dot={false}
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</WidgetState>
	);
}

// ── income-card: tax-income stream ────────────────────────────────

function IncomeCardWidget({ provider }: { provider: CapabilityDataProvider }) {
	const { data, loading, loaded } = useCapabilityPoll<Record<string, unknown>>(provider.endpoint, 60_000);
	// tax-income returns { amountWei, count, source }. Render wei as BNB-scale
	// (1e18) — the fee stream is denominated in the chain's native unit.
	const amountWei = str(data?.amountWei) || "0";
	const count = num(data?.count);
	const source = str(data?.source);
	const amount = useMemo(() => {
		try {
			const wei = BigInt(amountWei || "0");
			// scale to a human number without floating bigint: divide by 1e14 then /1e4
			return Number(wei / 100_000_000_000_000n) / 10_000;
		} catch {
			return 0;
		}
	}, [amountWei]);
	const hasAny = loaded && (amount !== 0 || count !== 0);

	return (
		<WidgetState loading={loading && !loaded} empty={loaded && !hasAny}>
			<div className="flex items-baseline justify-between">
				<MicroStat label="accrued income" value={`${fmtNum(amount, 6)}`} tone="accent" />
				<MicroStat label="distributions" value={fmtNum(count, 0)} className="items-end" />
			</div>
			{source ? (
				<>
					<Hairline className="my-3" />
					<p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						source: {source.replace(/_/g, " ")}
					</p>
				</>
			) : null}
		</WidgetState>
	);
}

// ── fallback: raw json (activity-feed reuses this for now) ────────

function JsonWidget({ provider }: { provider: CapabilityDataProvider }) {
	const { data, loading, loaded } = useCapabilityPoll<unknown>(provider.endpoint);
	const empty = loaded && (data == null || (Array.isArray(data) && data.length === 0));
	return (
		<WidgetState loading={loading && !loaded} empty={empty}>
			<pre className="max-h-40 overflow-auto rounded-sm border border-[var(--border-soft)] bg-black/30 p-2 font-mono text-[10px] leading-relaxed text-[var(--text-secondary)]">
				{JSON.stringify(data, null, 2)}
			</pre>
		</WidgetState>
	);
}

/** Dispatch a data provider to its widget by render hint. */
export function CapabilityDataView({ provider }: { provider: CapabilityDataProvider }) {
	const widget = (() => {
		switch (provider.render) {
			case "metric-grid":
				return <MetricGridWidget provider={provider} />;
			case "positions-table":
				return <PositionsTableWidget provider={provider} />;
			case "line-chart":
				return <LineChartWidget provider={provider} />;
			case "income-card":
				return <IncomeCardWidget provider={provider} />;
			default:
				return <JsonWidget provider={provider} />;
		}
	})();

	return (
		<div>
			<p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
				{provider.label}
			</p>
			{widget}
		</div>
	);
}
