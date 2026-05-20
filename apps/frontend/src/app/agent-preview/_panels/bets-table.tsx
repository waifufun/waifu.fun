/**
 * Worker C - Bets Table.
 *
 * Prediction market positions (Polymarket / Kalshi). Empty today: the
 * polymarket account is pending fund. We render a 4-row placeholder
 * grid so the table shape is visible and the empty state teaches what
 * will fill it.
 */

"use client";

import { PolymarketIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import type { Bet } from "../lib/bets";
import { formatCompactUsd, formatPercent } from "../lib/format";
import { Label, Panel } from "./_primitives";

const HEADERS: { key: string; label: string; align?: "right" }[] = [
	{ key: "bet", label: "Bet" },
	{ key: "market", label: "Market" },
	{ key: "size", label: "Size", align: "right" },
	{ key: "pnl", label: "P/L (24H)", align: "right" },
	{ key: "pct", label: "%", align: "right" },
];

const MIN_ROWS = 4;

function ToneClass(n: number) {
	if (n > 0) return "text-[var(--positive)]";
	if (n < 0) return "text-[var(--negative)]";
	return "text-[var(--text-tertiary)]";
}

function Row({ bet }: { bet: Bet }) {
	return (
		<tr className="border-t border-[var(--border-soft)]">
			<td className="py-2.5 pr-3">
				<div className="flex items-center gap-2">
					<span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-soft)] text-[var(--accent)]">
						<PolymarketIcon className="h-3 w-3" />
					</span>
					<span className="truncate font-mono text-[12px] text-[var(--text-primary)]">{bet.title}</span>
				</div>
			</td>
			<td className="py-2.5 pr-3 font-mono text-[11px] text-[var(--text-secondary)]">{bet.market}</td>
			<td className="py-2.5 pr-3 text-right font-mono text-[12px] text-[var(--text-primary)] tabular-nums">
				{formatCompactUsd(bet.sizeUsd)}
			</td>
			<td className={cn("py-2.5 pr-3 text-right font-mono text-[12px] tabular-nums", ToneClass(bet.pnl24h))}>
				{bet.pnl24h === 0 ? "·" : formatCompactUsd(bet.pnl24h)}
			</td>
			<td className={cn("py-2.5 text-right font-mono text-[12px] tabular-nums", ToneClass(bet.pnl24hPct))}>
				{bet.pnl24hPct === 0 ? "·" : formatPercent(bet.pnl24hPct)}
			</td>
		</tr>
	);
}

function PlaceholderRow({ first }: { first: boolean }) {
	return (
		<tr className="border-t border-[var(--border-soft)]" aria-hidden>
			<td className="py-2.5 pr-3">
				<div className="flex items-center gap-2">
					<span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/[0.02]">
						<span className="h-1 w-1 rounded-full bg-[var(--text-tertiary)]" />
					</span>
					<span className="font-mono text-[11px] text-[var(--text-tertiary)]">{first ? "no bets yet" : "-"}</span>
				</div>
			</td>
			<td className="py-2.5 pr-3 font-mono text-[11px] text-[var(--text-tertiary)]">
				{first ? "polymarket account pending fund" : "-"}
			</td>
			<td className="py-2.5 pr-3 text-right font-mono text-[12px] text-[var(--text-tertiary)] tabular-nums">·</td>
			<td className="py-2.5 pr-3 text-right font-mono text-[12px] text-[var(--text-tertiary)] tabular-nums">·</td>
			<td className="py-2.5 text-right font-mono text-[12px] text-[var(--text-tertiary)] tabular-nums">·</td>
		</tr>
	);
}

export function BetsTable({ bets }: { bets: Bet[] }) {
	const rows = bets.slice(0, MIN_ROWS);
	const placeholders = Math.max(0, MIN_ROWS - rows.length);

	return (
		<Panel>
			<Label
				right={
					<a
						href="/agent-preview/bets"
						className={cn(
							"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]",
							"transition-colors hover:text-[var(--accent)]",
						)}
					>
						View All →
					</a>
				}
			>
				Bets
			</Label>

			<table className="w-full">
				<thead>
					<tr>
						{HEADERS.map((h) => (
							<th
								key={h.key}
								className={cn(
									"pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]",
									h.align === "right" ? "text-right" : "text-left",
								)}
							>
								{h.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((b) => (
						<Row key={b.id} bet={b} />
					))}
					{Array.from({ length: placeholders }).map((_, i) => (
						<PlaceholderRow key={`ph-${rows.length + i}`} first={i === 0 && rows.length === 0} />
					))}
				</tbody>
			</table>
		</Panel>
	);
}
