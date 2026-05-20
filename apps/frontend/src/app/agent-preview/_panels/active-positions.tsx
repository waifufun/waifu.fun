/**
 * Active Positions table (Wave T worker B v2).
 *
 * Lists all live positions across venues (spot, perps, LP). Honest empty
 * rows for venues that are scheduled but not yet funded – no fake PnL.
 *
 * Columns: asset / venue / size / pnl ($) / pnl (%) / leverage badge
 * Footer: total unrealized PnL summed across live rows.
 *
 * Data: \`lib/positions.ts\`. Currently returns one BNB spot position on
 * the Sol burner. Perps + LP positions will surface when accounts fund.
 */

"use client";

import { TrendingUpIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import type { Position } from "../lib/positions";
import { Label, Panel } from "./_primitives";

type ScheduledVenue = {
	id: string;
	asset: string;
	venue: string;
};

// Venues Sol intends to operate but aren't funded yet. These render as
// honest empty rows below the live positions.
const SCHEDULED: ScheduledVenue[] = [
	{ id: "perp-hl", asset: "BTC-USD", venue: "hyperliquid perp" },
	{ id: "lp-pcs", asset: "BNB/USDT", venue: "pancake v3 lp" },
	{ id: "vault-asth", asset: "USDC", venue: "astherus vault" },
];

function fmtUsd(v: number, opts: { withSign?: boolean } = {}): string {
	if (!Number.isFinite(v)) return "$0.00";
	const sign = opts.withSign ? (v > 0 ? "+" : v < 0 ? "" : "") : "";
	const abs = Math.abs(v);
	const body =
		abs >= 1000 ? abs.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : abs.toFixed(2);
	return `${sign}${v < 0 ? "-" : ""}$${body}`;
}

function fmtPct(v: number): string {
	if (!Number.isFinite(v) || v === 0) return "0.00%";
	const sign = v > 0 ? "+" : "";
	return `${sign}${v.toFixed(2)}%`;
}

function toneOfPnl(pnl: number): "positive" | "negative" | "neutral" {
	if (pnl > 0) return "positive";
	if (pnl < 0) return "negative";
	return "neutral";
}

export function ActivePositions({ positions }: { positions: Position[] }) {
	const live = useMemo(() => positions.filter((p) => p.status === "live"), [positions]);
	const totalPnl = useMemo(() => live.reduce((acc, p) => acc + p.pnl24h, 0), [live]);
	const tone = toneOfPnl(totalPnl);

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					<button
						className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
						type="button"
					>
						view all
					</button>
				}
			>
				active positions
			</Label>

			<div className="flex-1 overflow-x-auto">
				<table className="w-full border-collapse font-mono text-[11px]">
					<thead>
						<tr className="text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							<th className="pb-2 pr-2 font-normal">asset</th>
							<th className="pb-2 pr-2 font-normal">venue</th>
							<th className="pb-2 pr-2 text-right font-normal">size</th>
							<th className="pb-2 pr-2 text-right font-normal">pnl</th>
							<th className="pb-2 text-right font-normal">%</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-[var(--border-soft)]">
						{live.map((p) => {
							const rowTone = toneOfPnl(p.pnl24h);
							return (
								<tr className="text-[var(--text-primary)]" key={p.id}>
									<td className="py-2 pr-2">
										<span className="inline-flex items-center gap-1.5">
											<span className="text-[var(--text-primary)]">{p.asset}</span>
										</span>
									</td>
									<td className="py-2 pr-2 text-[var(--text-secondary)]">{p.venue}</td>
									<td className="py-2 pr-2 text-right tabular-nums">{fmtUsd(p.valueUsd)}</td>
									<td
										className={cn(
											"py-2 pr-2 text-right tabular-nums",
											rowTone === "positive"
												? "text-[var(--positive)]"
												: rowTone === "negative"
													? "text-[var(--negative)]"
													: "text-[var(--text-tertiary)]",
										)}
									>
										{p.pnl24h === 0 ? "–" : fmtUsd(p.pnl24h, { withSign: true })}
									</td>
									<td
										className={cn(
											"py-2 text-right tabular-nums",
											rowTone === "positive"
												? "text-[var(--positive)]"
												: rowTone === "negative"
													? "text-[var(--negative)]"
													: "text-[var(--text-tertiary)]",
										)}
									>
										{p.pnl24hPct === 0 ? "–" : fmtPct(p.pnl24hPct)}
									</td>
								</tr>
							);
						})}
						{SCHEDULED.map((s) => (
							<tr className="text-[var(--text-tertiary)]" key={s.id}>
								<td className="py-2 pr-2">{s.asset}</td>
								<td className="py-2 pr-2">
									<span className="inline-flex items-center gap-1.5">
										<span>{s.venue}</span>
										<span className="rounded-full border border-[var(--border-soft)] px-1.5 py-0 text-[8px] uppercase tracking-[0.18em]">
											scheduled
										</span>
									</span>
								</td>
								<td className="py-2 pr-2 text-right">–</td>
								<td className="py-2 pr-2 text-right">–</td>
								<td className="py-2 text-right">–</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<footer className="mt-3 flex items-center justify-between border-t border-[var(--border-soft)] pt-3 font-mono text-[10px] uppercase tracking-[0.18em]">
				<span className="text-[var(--text-tertiary)]">total unrealized p&amp;l</span>
				<span
					className={cn(
						"inline-flex items-center gap-1.5 tabular-nums",
						tone === "positive"
							? "text-[var(--positive)]"
							: tone === "negative"
								? "text-[var(--negative)]"
								: "text-[var(--text-secondary)]",
					)}
				>
					{tone === "positive" && <TrendingUpIcon className="h-3 w-3" />}
					{totalPnl === 0 ? "$0.00" : fmtUsd(totalPnl, { withSign: true })}
				</span>
			</footer>
		</Panel>
	);
}

export default ActivePositions;
