/**
 * Trading panel (Wave T) — Steward-custodial trade state for the agent.
 *
 * Single `<Panel>` primitive with three logically-grouped sections,
 * separated by hairlines (not nested cards):
 *
 *   1. Session row — cap meter, expiry countdown, policy pills.
 *   2. Active positions — table on Hyperliquid (or honest empty state).
 *   3. Recent orders — last ~8 fills/rejections (or honest empty state).
 *
 * Data source: `lib/wave-t/trading.ts`, which fetches the proxied
 * Steward snapshot from `api.waifu.fun/v2/agents/:address/trading`.
 *
 * Design choices that matter:
 *   - One scope, one accent (#00ff87 via THEME_TOKENS).
 *   - Numbers are mono + tabular-nums. Labels are sans.
 *   - Density 4-5. No `<Section>` chrome. No `lg:grid-cols-3` for <3 items.
 *   - Empty states are wave-t grammar: "no open positions · awaiting first trade".
 *   - When `enabled === false` (non-sol agents), render an honest
 *     "trading not enabled" placeholder inside the same panel shell.
 */

"use client";

import { useEffect, useState } from "react";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";

import type { TradingOrder, TradingPosition, TradingSession, TradingSnapshot } from "@/lib/wave-t/trading";
import { Hairline, Label, Panel, Pulse, StatPill } from "./_primitives";

// ── formatting helpers (local; trading panel is the only consumer) ──

function fmtUsd(v: number, opts: { withSign?: boolean; compact?: boolean } = {}): string {
	if (!Number.isFinite(v)) return "$0";
	const abs = Math.abs(v);
	const sign = opts.withSign && v > 0 ? "+" : v < 0 ? "-" : "";
	if (opts.compact && abs >= 1000) {
		if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
		return `${sign}$${(abs / 1e3).toFixed(2)}K`;
	}
	if (abs >= 100) return `${sign}$${abs.toFixed(0)}`;
	return `${sign}$${abs.toFixed(2)}`;
}

function fmtPx(v: number): string {
	if (!Number.isFinite(v) || v <= 0) return "—";
	if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
	if (v >= 1) return `$${v.toFixed(2)}`;
	return `$${v.toFixed(4)}`;
}

function fmtPct(v: number): string {
	if (!Number.isFinite(v) || v === 0) return "0.00%";
	const sign = v > 0 ? "+" : "";
	return `${sign}${v.toFixed(2)}%`;
}

/** "8h 24m" / "12m 04s" / "expired" — used by SessionCountdown only. */
function fmtRemaining(ms: number, expiredLabel: string): string {
	if (ms <= 0) return expiredLabel;
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
	if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
	return `${s}s`;
}

/** "2m ago" / "4h ago" / "3d ago". */
function fmtRelative(ts: number, labels: { sec: string; min: string; hr: string; day: string }): string {
	const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
	if (diffSec < 60) return labels.sec.replace("{{n}}", String(diffSec));
	if (diffSec < 3600) return labels.min.replace("{{n}}", String(Math.floor(diffSec / 60)));
	if (diffSec < 86400) return labels.hr.replace("{{n}}", String(Math.floor(diffSec / 3600)));
	return labels.day.replace("{{n}}", String(Math.floor(diffSec / 86400)));
}

// ── live countdown (isolated client component, 30s tick) ─────────

function SessionCountdown({ expiresAt }: { expiresAt: number }) {
	const { t } = useTranslation();
	const [now, setNow] = useState<number>(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 30_000);
		return () => window.clearInterval(id);
	}, []);
	const remaining = expiresAt - now;
	return (
		<span className="font-mono tabular-nums text-[var(--text-primary)]">
			{fmtRemaining(remaining, t("agent.trading.expired"))}
		</span>
	);
}

// ── cap meter (1px-grid horizontal bar) ───────────────────────────

function CapMeter({ used, cap, active }: { used: number; cap: number; active: boolean }) {
	const { t } = useTranslation();
	const ratio = cap > 0 ? Math.max(0, Math.min(1, used / cap)) : 0;
	const pctLabel = cap > 0 ? `${(ratio * 100).toFixed(0)}%` : "0%";
	return (
		<div className="flex w-full flex-col gap-1.5">
			<div className="flex items-baseline justify-between font-mono">
				<span className="text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					{t("agent.trading.dailyCap")}
				</span>
				<span className="tabular-nums text-[11px] text-[var(--text-secondary)]">
					<span className={cn(used > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
						{fmtUsd(used)}
					</span>
					<span className="px-1 text-[var(--text-tertiary)]">/</span>
					<span>{fmtUsd(cap)}</span>
					<span className="ml-2 text-[var(--text-tertiary)]">{pctLabel}</span>
				</span>
			</div>
			<div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
				<div
					className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
					style={{
						width: `${ratio * 100}%`,
						backgroundColor: active ? "var(--accent)" : "var(--neutral)",
						boxShadow: active ? "0 0 6px var(--accent-soft)" : "none",
					}}
				/>
			</div>
		</div>
	);
}

// ── session row ───────────────────────────────────────────────────

function SessionRow({ session }: { session: TradingSession }) {
	const { t } = useTranslation();
	const { policy, active, expiresAt } = session;
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
			<CapMeter active={active} cap={policy.dailyCapUsd} used={policy.dailyUsedUsd} />

			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
				<div className="flex flex-col gap-0.5">
					<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
						{t("agent.trading.session")}
					</span>
					<span className="font-mono text-[11px]">
						{active && expiresAt ? (
							<SessionCountdown expiresAt={expiresAt} />
						) : (
							<span className="text-[var(--text-secondary)]">{t("agent.trading.inactive")}</span>
						)}
					</span>
				</div>

				<div className="flex flex-col gap-0.5">
					<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
						{t("agent.trading.leverage")}
					</span>
					<span className="font-mono tabular-nums text-[11px] text-[var(--text-primary)]">
						{t("agent.trading.maxLeverage", { x: String(policy.maxLeverage) })}
					</span>
				</div>

				<div className="flex flex-col gap-1">
					<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
						{t("agent.trading.assets")}
					</span>
					<div className="flex gap-1.5">
						{policy.allowedAssets.map((a) => (
							<StatPill key={a} tone={active ? "accent" : "neutral"}>
								{a}
							</StatPill>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── positions table ───────────────────────────────────────────────

function PositionsTable({ positions }: { positions: TradingPosition[] }) {
	const { t } = useTranslation();
	if (positions.length === 0) {
		return (
			<div className="py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				{t("agent.trading.noOpenPositions")}
			</div>
		);
	}
	return (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse font-mono text-[11px]">
				<thead>
					<tr className="text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						<th className="pb-2 pr-3 font-normal">{t("agent.trading.colCoin")}</th>
						<th className="pb-2 pr-3 font-normal">{t("agent.trading.colSide")}</th>
						<th className="pb-2 pr-3 text-right font-normal">{t("agent.trading.colSize")}</th>
						<th className="pb-2 pr-3 text-right font-normal">{t("agent.trading.colEntry")}</th>
						<th className="pb-2 pr-3 text-right font-normal">{t("agent.trading.colMark")}</th>
						<th className="pb-2 pr-3 text-right font-normal">{t("agent.trading.colPnl")}</th>
						<th className="pb-2 text-right font-normal">{t("agent.trading.colPct")}</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--border-soft)]">
					{positions.map((p) => {
						const tone = p.pnlUsd > 0 ? "positive" : p.pnlUsd < 0 ? "negative" : "neutral";
						const pnlCls =
							tone === "positive"
								? "text-[var(--positive)]"
								: tone === "negative"
									? "text-[var(--negative)]"
									: "text-[var(--text-tertiary)]";
						const sideCls = p.side === "long" ? "text-[var(--positive)]" : "text-[var(--negative)]";
						return (
							<tr className="text-[var(--text-primary)]" key={`${p.coin}-${p.side}`}>
								<td className="py-2 pr-3 tabular-nums">{p.coin}</td>
								<td className={cn("py-2 pr-3 uppercase tracking-[0.12em]", sideCls)}>
									{p.side} {p.leverage}x
								</td>
								<td className="py-2 pr-3 text-right tabular-nums">{fmtUsd(p.sizeUsd)}</td>
								<td className="py-2 pr-3 text-right tabular-nums text-[var(--text-secondary)]">{fmtPx(p.entryPx)}</td>
								<td className="py-2 pr-3 text-right tabular-nums">{fmtPx(p.markPx)}</td>
								<td className={cn("py-2 pr-3 text-right tabular-nums", pnlCls)}>
									{p.pnlUsd === 0 ? "$0.00" : fmtUsd(p.pnlUsd, { withSign: true })}
								</td>
								<td className={cn("py-2 text-right tabular-nums", pnlCls)}>{fmtPct(p.pnlPct)}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

// ── recent orders list ────────────────────────────────────────────

function OrdersList({ orders }: { orders: TradingOrder[] }) {
	const { t } = useTranslation();
	const relativeLabels = {
		sec: t("agent.trading.timeAgoSeconds"),
		min: t("agent.trading.timeAgoMinutes"),
		hr: t("agent.trading.timeAgoHours"),
		day: t("agent.trading.timeAgoDays"),
	};
	if (orders.length === 0) {
		return (
			<div className="py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
				{t("agent.trading.noTradesYet")}
			</div>
		);
	}
	return (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse font-mono text-[11px]">
				<thead>
					<tr className="text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						<th className="pb-2 pr-3 font-normal">{t("agent.trading.colTime")}</th>
						<th className="pb-2 pr-3 font-normal">{t("agent.trading.colSide")}</th>
						<th className="pb-2 pr-3 font-normal">{t("agent.trading.colCoin")}</th>
						<th className="pb-2 pr-3 text-right font-normal">{t("agent.trading.colSize")}</th>
						<th className="pb-2 pr-3 text-right font-normal">{t("agent.trading.colPrice")}</th>
						<th className="pb-2 font-normal">{t("agent.trading.colStatus")}</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--border-soft)]">
					{orders.map((o) => {
						const sideCls = o.side === "long" ? "text-[var(--positive)]" : "text-[var(--negative)]";
						const statusTone: "positive" | "negative" | "neutral" =
							o.status === "filled"
								? "positive"
								: o.status === "rejected"
									? "negative"
									: o.status === "cancelled"
										? "neutral"
										: "neutral";
						const statusCls =
							statusTone === "positive"
								? "text-[var(--positive)]"
								: statusTone === "negative"
									? "text-[var(--negative)]"
									: "text-[var(--text-secondary)]";
						return (
							<tr className="align-top text-[var(--text-primary)]" key={o.id}>
								<td className="py-2 pr-3 text-[var(--text-secondary)] tabular-nums">
									{fmtRelative(o.timestamp, relativeLabels)}
								</td>
								<td className={cn("py-2 pr-3 uppercase tracking-[0.12em]", sideCls)}>{o.side}</td>
								<td className="py-2 pr-3">{o.coin}</td>
								<td className="py-2 pr-3 text-right tabular-nums">{fmtUsd(o.sizeUsd)}</td>
								<td className="py-2 pr-3 text-right text-[var(--text-secondary)] tabular-nums">{fmtPx(o.priceUsd)}</td>
								<td className="py-2">
									<div className="flex flex-col gap-0.5">
										<span className={cn("uppercase tracking-[0.18em]", statusCls)}>{o.status}</span>
										{o.status === "rejected" && o.rejectReason ? (
											<span className="text-[10px] lowercase tracking-normal text-[var(--text-tertiary)]">
												{o.rejectReason.replace(/-/g, " ")}
											</span>
										) : null}
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

// ── public component ──────────────────────────────────────────────

export function TradingPanel({ snapshot }: { snapshot: TradingSnapshot }) {
	const { t } = useTranslation();
	const { enabled, session, positions, orders } = snapshot;

	// Non-enabled (every agent that isn't Sol, for the next 30 days):
	// render the same panel shell with one honest line. Keeps the page
	// rhythm consistent across agents without inventing data.
	if (!enabled || !session) {
		return (
			<Panel>
				<Label
					right={
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							{t("agent.trading.notEnabled")}
						</span>
					}
				>
					{t("agent.trading.label")}
				</Label>
				<div className="py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					{t("agent.trading.notEnabledBody")}
				</div>
			</Panel>
		);
	}

	const sessionStatusRight = session.active ? (
		<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--accent)]">
			<Pulse />
			{t("agent.trading.activeWith", { venue: session.venue })}
		</span>
	) : (
		<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
			<span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
			{t("agent.trading.inactiveWith", { venue: session.venue })}
		</span>
	);

	return (
		<Panel>
			<Label right={sessionStatusRight}>{t("agent.trading.label")}</Label>

			<SessionRow session={session} />

			<Hairline className="my-4" />

			<div className="mb-2 flex items-center justify-between">
				<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					{t("agent.trading.openPositions")}
				</span>
				{positions.length > 0 ? (
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] tabular-nums">
						{t("agent.trading.liveCount", { count: String(positions.length) })}
					</span>
				) : null}
			</div>
			<PositionsTable positions={positions} />

			<Hairline className="my-4" />

			<div className="mb-2 flex items-center justify-between">
				<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
					{t("agent.trading.recentOrders")}
				</span>
				{orders.length > 0 ? (
					<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] tabular-nums">
						{t("agent.trading.lastCount", { count: String(orders.length) })}
					</span>
				) : null}
			</div>
			<OrdersList orders={orders.slice(0, 8)} />
		</Panel>
	);
}

export default TradingPanel;
