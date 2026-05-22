/**
 * Active Positions table (Wave T, sophistication pass 2026-05-22).
 *
 * Lists live positions across venues (spot, perps, LP). No more
 * hardcoded SCHEDULED fixture rows; the empty state is honest and
 * single-line. Em-dash glyph placeholders are gone (banned by
 * .impeccable.md), replaced with a middot in empty cells.
 *
 * Columns: asset / venue / size / pnl ($) / pnl (%).
 * Footer: total unrealized PnL summed across live rows.
 *
 * Data: `lib/positions.ts`.
 */

"use client";

import { TrendingUpIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import type { Position } from "@/lib/wave-t/positions";
import type { TokenChain } from "@/lib/wave-t/token-logo";
import { Label, Panel, TokenIcon, VenueIcon } from "./_primitives";

// Middot used for empty numeric cells. Never an em dash glyph (banned by
// .impeccable.md), never an ASCII hyphen pretending to be a minus.
const EMPTY_CELL = "·";

function chainOfVenue(venue: string): TokenChain {
	const v = venue.toLowerCase();
	if (v.includes("bsc") || v.includes("pancake") || v.includes("four")) return "bsc";
	if (v.includes("polygon")) return "polygon";
	if (v.includes("solana") || v.includes("drift")) return "solana";
	if (v.includes("base")) return "base";
	return "ethereum";
}

function primaryAssetOf(asset: string): string {
	const m = asset.match(/^[A-Z0-9]+/);
	return m ? m[0] : asset;
}

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
					live.length === 0 ? (
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							awaiting deposit
						</span>
					) : null
				}
			>
				active positions
			</Label>

			<div className="flex-1 overflow-x-auto">
				{live.length === 0 ? (
					<div className="flex flex-col gap-1.5 py-3 font-mono">
						<span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							no live positions
						</span>
						<span className="text-[11px] leading-snug text-[var(--text-tertiary)]/70">
							venues scheduled: hyperliquid (perp), pancake v3 (lp), polymarket (predictions), drift (perp)
						</span>
					</div>
				) : (
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
										<td className="py-2.5 pr-2">
											<span className="inline-flex items-center gap-1.5">
												<TokenIcon
													address=""
													chain={chainOfVenue(p.venue)}
													size={14}
													symbol={primaryAssetOf(p.asset)}
												/>
												<span className="text-[var(--text-primary)]">{p.asset}</span>
											</span>
										</td>
										<td className="py-2.5 pr-2 text-[var(--text-secondary)]">
											<span className="inline-flex items-center gap-1.5">
												<VenueIcon size={14} venue={p.venue} />
												<span>{p.venue}</span>
											</span>
										</td>
										<td className="py-2.5 pr-2 text-right tabular-nums">{fmtUsd(p.valueUsd)}</td>
										<td
											className={cn(
												"py-2.5 pr-2 text-right tabular-nums",
												rowTone === "positive"
													? "text-[var(--positive)]"
													: rowTone === "negative"
														? "text-[var(--negative)]"
														: "text-[var(--text-tertiary)]",
											)}
										>
											{p.pnl24h === 0 ? EMPTY_CELL : fmtUsd(p.pnl24h, { withSign: true })}
										</td>
										<td
											className={cn(
												"py-2.5 text-right tabular-nums",
												rowTone === "positive"
													? "text-[var(--positive)]"
													: rowTone === "negative"
														? "text-[var(--negative)]"
														: "text-[var(--text-tertiary)]",
											)}
										>
											{p.pnl24hPct === 0 ? EMPTY_CELL : fmtPct(p.pnl24hPct)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>

			<footer className="mt-3 flex items-center justify-between border-t border-[var(--border-soft)] pt-3 font-mono text-[10px] uppercase tracking-[0.18em]">
				<span className="text-[var(--text-tertiary)]">
					{live.length === 0 ? "awaiting first venue deposit" : "total unrealized p&l"}
				</span>
				{live.length > 0 ? (
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
				) : null}
			</footer>
		</Panel>
	);
}

export default ActivePositions;
