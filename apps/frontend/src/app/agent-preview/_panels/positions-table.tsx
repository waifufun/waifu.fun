/**
 * Worker C - Positions Table.
 *
 * Spot + perp positions across venues. Today only one real row exists
 * (sol burner spot BNB on BSC). Remaining rows render placeholders so
 * the table shape is honest about being mostly unfunded.
 */

"use client";

import { InfoIcon } from "lucide-react";
import type * as React from "react";

import { BnbChainIcon, HyperliquidIcon, PancakeSwapIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import { formatCompactUsd, formatPercent } from "../lib/format";
import type { Position } from "../lib/positions";
import { Label, Panel } from "./_primitives";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;

const VENUE_ICONS: Record<string, IconComponent> = {
	"spot · bsc": BnbChainIcon,
	pancake: PancakeSwapIcon,
	hyperliquid: HyperliquidIcon,
};

const HEADERS: { key: string; label: string; align?: "right" }[] = [
	{ key: "asset", label: "Asset" },
	{ key: "venue", label: "Protocol" },
	{ key: "value", label: "Value", align: "right" },
	{ key: "pnl", label: "PnL (24H)", align: "right" },
	{ key: "pct", label: "%", align: "right" },
];

const MIN_ROWS = 4;

function ToneClass(n: number) {
	if (n > 0) return "text-[var(--positive)]";
	if (n < 0) return "text-[var(--negative)]";
	return "text-[var(--text-tertiary)]";
}

function Row({ position }: { position: Position }) {
	const Icon = VENUE_ICONS[position.venue] ?? BnbChainIcon;
	return (
		<tr className="border-t border-[var(--border-soft)]">
			<td className="py-2.5 pr-3">
				<div className="flex items-center gap-2">
					<span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-soft)] text-[var(--accent)]">
						<Icon className="h-3 w-3" />
					</span>
					<span className="font-mono text-[12px] text-[var(--text-primary)]">{position.asset}</span>
				</div>
			</td>
			<td className="py-2.5 pr-3">
				<span className="font-mono text-[11px] text-[var(--text-secondary)]">{position.venue}</span>
			</td>
			<td className="py-2.5 pr-3 text-right font-mono text-[12px] text-[var(--text-primary)] tabular-nums">
				{formatCompactUsd(position.valueUsd)}
			</td>
			<td className={cn("py-2.5 pr-3 text-right font-mono text-[12px] tabular-nums", ToneClass(position.pnl24h))}>
				{position.pnl24h === 0 ? "·" : formatCompactUsd(position.pnl24h)}
			</td>
			<td className={cn("py-2.5 text-right font-mono text-[12px] tabular-nums", ToneClass(position.pnl24hPct))}>
				{position.pnl24hPct === 0 ? "·" : formatPercent(position.pnl24hPct)}
			</td>
		</tr>
	);
}

function PlaceholderRow({ index }: { index: number }) {
	return (
		<tr className="border-t border-[var(--border-soft)]" aria-hidden>
			<td className="py-2.5 pr-3">
				<div className="flex items-center gap-2">
					<span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/[0.02]">
						<span className="h-1 w-1 rounded-full bg-[var(--text-tertiary)]" />
					</span>
					<span className="font-mono text-[11px] text-[var(--text-tertiary)]">{index === 0 ? "-" : "-"}</span>
				</div>
			</td>
			<td className="py-2.5 pr-3 font-mono text-[11px] text-[var(--text-tertiary)]">slot reserved</td>
			<td className="py-2.5 pr-3 text-right font-mono text-[12px] text-[var(--text-tertiary)] tabular-nums">·</td>
			<td className="py-2.5 pr-3 text-right font-mono text-[12px] text-[var(--text-tertiary)] tabular-nums">·</td>
			<td className="py-2.5 text-right font-mono text-[12px] text-[var(--text-tertiary)] tabular-nums">·</td>
		</tr>
	);
}

export function PositionsTable({ positions }: { positions: Position[] }) {
	const rows = positions.slice(0, MIN_ROWS);
	const placeholders = Math.max(0, MIN_ROWS - rows.length);

	return (
		<Panel>
			<Label
				right={
					<a
						href="/agent-preview/trading"
						className={cn(
							"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]",
							"transition-colors hover:text-[var(--accent)]",
						)}
					>
						View All →
					</a>
				}
			>
				Positions
				<span
					className="text-[var(--text-tertiary)]"
					title="Spot + perp positions across venues. Mostly empty until accounts fund."
				>
					<InfoIcon className="h-3 w-3" />
				</span>
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
					{rows.map((p) => (
						<Row key={p.id} position={p} />
					))}
					{Array.from({ length: placeholders }).map((_, i) => (
						<PlaceholderRow key={`ph-${rows.length + i}`} index={i} />
					))}
				</tbody>
			</table>
		</Panel>
	);
}
