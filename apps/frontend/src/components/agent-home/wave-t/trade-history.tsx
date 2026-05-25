/**
 * Trade History panel - last 20 perp trade events from agent_events.
 *
 * Filters the live agent_events poll to `trade.open` / `trade.close` /
 * `trade.fill` / `trade.liquidation` and renders them as a compact
 * timestamp / asset / side / size / price / pnl / leverage table.
 *
 * Live data: `useAgentEvents` polls every 15s. PnL appears on close
 * rows; fill rows show the per-fill closedPnl when non-zero.
 */

"use client";

import { useMemo } from "react";

import { type AgentEvent, useAgentEvents } from "@/lib/hooks/use-agent-events";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/wave-t/github";
import { Label, Panel, VenueIcon } from "./_primitives";

const TRADE_TYPES = ["trade.open", "trade.close", "trade.fill", "trade.liquidation"] as const;

type TradeRow = {
	id: string;
	createdAt: string;
	kind: "open" | "close" | "fill" | "liquidation";
	venue: string;
	asset: string;
	side: "long" | "short";
	size: number | null;
	price: number | null;
	pnlUsd: number | null;
	pnlPct: number | null;
	leverage: number | null;
};

function num(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function precisionForAsset(asset: string): number {
	const u = asset.toUpperCase();
	if (u === "BTC") return 5;
	if (u === "ETH") return 4;
	if (u === "SOL") return 3;
	if (u === "BNB") return 3;
	return 4;
}

function fmtSize(asset: string, size: number | null): string {
	if (size === null) return "·";
	return size.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: precisionForAsset(asset),
	});
}

function fmtUsd(value: number | null, withSign = false): string {
	if (value === null || !Number.isFinite(value)) return "·";
	const sign = withSign ? (value > 0 ? "+" : value < 0 ? "" : "") : "";
	const abs = Math.abs(value);
	const body =
		abs >= 1000 ? abs.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : abs.toFixed(2);
	return `${sign}${value < 0 ? "-" : ""}$${body}`;
}

function fmtPct(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "";
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}%`;
}

function toRow(event: AgentEvent): TradeRow | null {
	const t = event.eventType;
	if (!TRADE_TYPES.includes(t as (typeof TRADE_TYPES)[number])) return null;
	const kind: TradeRow["kind"] =
		t === "trade.open" ? "open" : t === "trade.close" ? "close" : t === "trade.fill" ? "fill" : "liquidation";
	const payload = event.payload ?? {};
	const rawSide = asString(payload.side, "long").toLowerCase();
	const side: "long" | "short" = rawSide === "short" || rawSide === "sell" || rawSide === "a" ? "short" : "long";
	const asset = asString(payload.asset, asString(payload.coin, asString(payload.symbol, "asset"))).toUpperCase();
	return {
		id: event.id,
		createdAt: event.createdAt,
		kind,
		venue: asString(payload.venue, "hyperliquid"),
		asset,
		side,
		size: num(payload.size) ?? num(payload.amount),
		price: num(payload.price) ?? num(payload.entryPrice) ?? num(payload.fillPriceUsd) ?? num(payload.entryPriceUsd),
		pnlUsd: num(payload.pnlUsd) ?? num(payload.closedPnl),
		pnlPct: num(payload.pnlPct),
		leverage: num(payload.leverage),
	};
}

function kindBadge(kind: TradeRow["kind"]) {
	const map: Record<TradeRow["kind"], { label: string; cls: string }> = {
		open: { label: "open", cls: "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]" },
		close: { label: "close", cls: "border-[var(--border-mid)] bg-white/[0.02] text-[var(--text-secondary)]" },
		fill: { label: "fill", cls: "border-[var(--border-soft)] bg-white/[0.02] text-[var(--text-tertiary)]" },
		liquidation: {
			label: "liq",
			cls: "border-[var(--negative)]/40 bg-[var(--negative)]/10 text-[var(--negative)]",
		},
	};
	const meta = map[kind];
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]",
				meta.cls,
			)}
		>
			{meta.label}
		</span>
	);
}

export function TradeHistoryPanel({ agentId }: { agentId: string | null }) {
	const { events } = useAgentEvents(agentId, { pollMs: 15_000, limit: 80 });
	const rows = useMemo(() => {
		const out: TradeRow[] = [];
		for (const event of events) {
			const row = toRow(event);
			if (row) out.push(row);
		}
		return out.slice(0, 20);
	}, [events]);

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						<VenueIcon size={12} venue="hyperliquid" />
						<span>hyperliquid</span>
					</span>
				}
			>
				trade history
			</Label>

			{rows.length === 0 ? (
				<div className="py-4 font-mono text-[11px] text-[var(--text-tertiary)]">no trades yet</div>
			) : (
				<div className="-mx-1 overflow-x-auto">
					<table className="w-full border-collapse font-mono text-[11px]">
						<thead>
							<tr className="text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
								<th className="px-1 pb-2 font-normal">when</th>
								<th className="px-1 pb-2 font-normal">kind</th>
								<th className="px-1 pb-2 font-normal">asset</th>
								<th className="px-1 pb-2 font-normal">side</th>
								<th className="px-1 pb-2 text-right font-normal">size</th>
								<th className="px-1 pb-2 text-right font-normal">price</th>
								<th className="px-1 pb-2 text-right font-normal">lev</th>
								<th className="px-1 pb-2 text-right font-normal">pnl</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[var(--border-soft)]">
							{rows.map((row) => {
								const pnlTone =
									row.pnlUsd === null || row.pnlUsd === 0
										? "text-[var(--text-tertiary)]"
										: row.pnlUsd > 0
											? "text-[var(--positive)]"
											: "text-[var(--negative)]";
								const sideTone = row.side === "long" ? "text-[var(--positive)]" : "text-[var(--negative)]";
								return (
									<tr key={row.id} className="text-[var(--text-primary)]">
										<td className="px-1 py-2 text-[var(--text-tertiary)] tabular-nums">
											{relativeTime(row.createdAt)}
										</td>
										<td className="px-1 py-2">{kindBadge(row.kind)}</td>
										<td className="px-1 py-2">{row.asset.toLowerCase()}</td>
										<td className={cn("px-1 py-2 uppercase", sideTone)}>{row.side}</td>
										<td className="px-1 py-2 text-right tabular-nums">{fmtSize(row.asset, row.size)}</td>
										<td className="px-1 py-2 text-right tabular-nums">{fmtUsd(row.price)}</td>
										<td className="px-1 py-2 text-right tabular-nums text-[var(--text-secondary)]">
											{row.leverage ? `${row.leverage}x` : "·"}
										</td>
										<td className={cn("px-1 py-2 text-right tabular-nums", pnlTone)}>
											<span className="block">{fmtUsd(row.pnlUsd, true)}</span>
											{row.pnlPct !== null && row.pnlPct !== 0 ? (
												<span className="block text-[10px] text-[var(--text-tertiary)]">{fmtPct(row.pnlPct)}</span>
											) : null}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</Panel>
	);
}

export default TradeHistoryPanel;
