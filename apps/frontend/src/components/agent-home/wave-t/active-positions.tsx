/**
 * Active Positions table (Wave T).
 *
 * Two modes:
 *
 *  1. Legacy generic mode: takes a `positions: Position[]` prop sourced from
 *     `lib/positions.ts`. Renders a 5-column asset/venue/size/pnl/% table.
 *
 *  2. Live Hyperliquid mode (new, optional): when `hyperliquidAgentId` is
 *     provided, the panel additionally polls `/v2/agents/:id/hyperliquid/
 *     positions` every 5s and renders the much richer perp-position table
 *     (asset, side, size, entry, mark, leverage, liq, unrealized pnl, close
 *     stub button) at the top. The legacy generic table still renders below
 *     so cross-venue rows (LP, prediction markets) keep their home.
 *
 * Em-dash glyph placeholders are banned (.impeccable.md); empty numeric
 * cells use a middot.
 */

"use client";

import { TrendingUpIcon, XIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { type HyperliquidPosition, useHyperliquidPositions } from "@/lib/hooks/use-hyperliquid-positions";
import type { Position } from "@/lib/wave-t/positions";
import type { TokenChain } from "@/lib/wave-t/token-logo";
import { Label, Panel, TokenIcon, VenueIcon } from "./_primitives";

// Middot used for empty numeric cells.
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

function fmtUsd(v: number | null | undefined, opts: { withSign?: boolean; decimals?: number } = {}): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "$0.00";
	const decimals = opts.decimals ?? 2;
	const sign = opts.withSign ? (v > 0 ? "+" : v < 0 ? "" : "") : "";
	const abs = Math.abs(v);
	const body =
		abs >= 1000
			? abs.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
			: abs.toFixed(decimals);
	return `${sign}${v < 0 ? "-" : ""}$${body}`;
}

function fmtPct(v: number | null | undefined): string {
	if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "0.00%";
	const sign = v > 0 ? "+" : "";
	return `${sign}${v.toFixed(2)}%`;
}

function precisionForAsset(asset: string): number {
	const u = asset.toUpperCase();
	if (u === "BTC") return 5;
	if (u === "ETH") return 4;
	if (u === "SOL") return 3;
	if (u === "BNB") return 3;
	return 4;
}

function fmtSize(asset: string, size: number): string {
	const precision = precisionForAsset(asset);
	return size.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: precision,
	});
}

function toneOfPnl(pnl: number): "positive" | "negative" | "neutral" {
	if (pnl > 0) return "positive";
	if (pnl < 0) return "negative";
	return "neutral";
}

function HyperliquidPositionsTable({ positions }: { positions: HyperliquidPosition[] }) {
	return (
		<table className="w-full border-collapse font-mono text-[11px]">
			<thead>
				<tr className="text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					<th className="pb-2 pr-2 font-normal">asset</th>
					<th className="pb-2 pr-2 font-normal">side</th>
					<th className="pb-2 pr-2 text-right font-normal">size</th>
					<th className="pb-2 pr-2 text-right font-normal">entry</th>
					<th className="pb-2 pr-2 text-right font-normal">mark</th>
					<th className="pb-2 pr-2 text-right font-normal">lev</th>
					<th className="pb-2 pr-2 text-right font-normal">liq</th>
					<th className="pb-2 pr-2 text-right font-normal">u-pnl</th>
					<th className="pb-2 text-right font-normal">close</th>
				</tr>
			</thead>
			<tbody className="divide-y divide-[var(--border-soft)]">
				{positions.map((p) => {
					const tone = toneOfPnl(p.unrealizedPnlUsd);
					const sideCls = p.side === "long" ? "text-[var(--positive)]" : "text-[var(--negative)]";
					return (
						<tr className="text-[var(--text-primary)]" key={`${p.coin}-${p.side}`}>
							<td className="py-2.5 pr-2">
								<span className="inline-flex items-center gap-1.5">
									<TokenIcon address="" chain={chainOfVenue("hyperliquid")} size={14} symbol={primaryAssetOf(p.coin)} />
									<span className="text-[var(--text-primary)]">{p.coin}</span>
								</span>
							</td>
							<td className={cn("py-2.5 pr-2 uppercase", sideCls)}>{p.side}</td>
							<td className="py-2.5 pr-2 text-right tabular-nums">{fmtSize(p.coin, p.size)}</td>
							<td className="py-2.5 pr-2 text-right tabular-nums">
								{p.entryPrice === null ? EMPTY_CELL : fmtUsd(p.entryPrice)}
							</td>
							<td className="py-2.5 pr-2 text-right tabular-nums">
								{p.currentPrice === null ? EMPTY_CELL : fmtUsd(p.currentPrice)}
							</td>
							<td className="py-2.5 pr-2 text-right tabular-nums">{p.leverage ? `${p.leverage}x` : EMPTY_CELL}</td>
							<td className="py-2.5 pr-2 text-right tabular-nums text-[var(--negative)]/80">
								{p.liquidationPrice === null ? EMPTY_CELL : fmtUsd(p.liquidationPrice)}
							</td>
							<td
								className={cn(
									"py-2.5 pr-2 text-right tabular-nums",
									tone === "positive"
										? "text-[var(--positive)]"
										: tone === "negative"
											? "text-[var(--negative)]"
											: "text-[var(--text-tertiary)]",
								)}
							>
								<span className="block">{fmtUsd(p.unrealizedPnlUsd, { withSign: true })}</span>
								{p.unrealizedPnlPct !== null ? (
									<span className="block text-[10px] text-[var(--text-tertiary)]">{fmtPct(p.unrealizedPnlPct)}</span>
								) : null}
							</td>
							<td className="py-2.5 text-right">
								<ClosePositionButton coin={p.coin} side={p.side} />
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

/**
 * Close-position stub. Wired to a no-op handler today; clicks emit a
 * console hint pointing at the (forthcoming) Steward submit-close
 * endpoint. We render the control now so the column reserves its
 * visual space and the screenshots show the full intended UX.
 */
function ClosePositionButton({ coin, side }: { coin: string; side: "long" | "short" }) {
	return (
		<button
			type="button"
			disabled
			title={`close ${side} ${coin} (steward submit pending)`}
			className={cn(
				"inline-flex h-6 items-center justify-center gap-1 rounded-sm px-2",
				"border border-[var(--border-mid)] bg-white/[0.02]",
				"font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]",
				"cursor-not-allowed opacity-60",
			)}
		>
			<XIcon className="h-3 w-3" />
			close
		</button>
	);
}

export function ActivePositions({
	positions,
	hyperliquidAgentId,
}: {
	positions: Position[];
	/** Optional. When set, the panel polls live HL positions for this agent. */
	hyperliquidAgentId?: string | null;
}) {
	const live = useMemo(() => positions.filter((p) => p.status === "live"), [positions]);
	const totalPnl = useMemo(() => live.reduce((acc, p) => acc + p.pnl24h, 0), [live]);
	const tone = toneOfPnl(totalPnl);

	const hl = useHyperliquidPositions(hyperliquidAgentId ?? null, { pollMs: 5_000 });
	const hlPositions = hl.snapshot.positions;
	const hlTotalUnrealized = useMemo(() => hlPositions.reduce((acc, p) => acc + p.unrealizedPnlUsd, 0), [hlPositions]);
	const hlTone = toneOfPnl(hlTotalUnrealized);

	const anyRows = hlPositions.length > 0 || live.length > 0;

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					hyperliquidAgentId ? (
						<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
							<span className="relative inline-flex h-1.5 w-1.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
								<span
									className="relative inline-flex h-1.5 w-1.5 rounded-full"
									style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }}
								/>
							</span>
							live
						</span>
					) : !anyRows ? (
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							awaiting deposit
						</span>
					) : null
				}
			>
				active positions
			</Label>

			<div className="flex-1 overflow-x-auto">
				{hlPositions.length > 0 ? (
					<div className="mb-3">
						<div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							<VenueIcon size={12} venue="hyperliquid" />
							<span>hyperliquid perp</span>
							<span>
								·{" "}
								<span className="text-[var(--text-secondary)] tabular-nums">{fmtUsd(hl.snapshot.accountValueUsd)}</span>{" "}
								account value
							</span>
						</div>
						<HyperliquidPositionsTable positions={hlPositions} />
					</div>
				) : null}

				{live.length === 0 && hlPositions.length === 0 ? (
					<div className="flex flex-col gap-1.5 py-3 font-mono">
						<span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							no live positions
						</span>
						<span className="text-[11px] leading-snug text-[var(--text-tertiary)]/70">
							venues scheduled: hyperliquid (perp), pancake v3 (lp), polymarket (predictions), drift (perp)
						</span>
					</div>
				) : null}

				{live.length > 0 ? (
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
				) : null}
			</div>

			<footer className="mt-3 flex items-center justify-between border-t border-[var(--border-soft)] pt-3 font-mono text-[10px] uppercase tracking-[0.18em]">
				<span className="text-[var(--text-tertiary)]">
					{hlPositions.length > 0
						? "total unrealized p&l"
						: live.length === 0
							? "awaiting first venue deposit"
							: "total unrealized p&l"}
				</span>
				{hlPositions.length > 0 ? (
					<span
						className={cn(
							"inline-flex items-center gap-1.5 tabular-nums",
							hlTone === "positive"
								? "text-[var(--positive)]"
								: hlTone === "negative"
									? "text-[var(--negative)]"
									: "text-[var(--text-secondary)]",
						)}
					>
						{hlTone === "positive" && <TrendingUpIcon className="h-3 w-3" />}
						{hlTotalUnrealized === 0 ? "$0.00" : fmtUsd(hlTotalUnrealized, { withSign: true })}
					</span>
				) : live.length > 0 ? (
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
