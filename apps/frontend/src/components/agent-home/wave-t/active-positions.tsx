/**
 * Active Positions panel (Wave T).
 *
 * Two modes:
 *
 *  1. Legacy generic mode: takes a `positions: Position[]` prop sourced from
 *     `lib/positions.ts`. Renders a 5-column asset/venue/size/pnl/% table.
 *
 *  2. Live Hyperliquid mode: when `hyperliquidPositions` are provided, the
 *     panel renders a premium perp surface: an account-health strip
 *     (account value, margin used, withdrawable, total unrealized pnl) on
 *     top, then a clean position table (asset/side, size, notional, entry,
 *     mark, leverage, liq, unrealized pnl). Data comes from the live
 *     /v2/agents/:address/hyperliquid/positions endpoint. The legacy
 *     generic table still renders below so cross-venue rows (LP, prediction
 *     markets) keep their home.
 *
 * Em-dash glyph placeholders are banned (.impeccable.md); empty numeric
 * cells use a middot. Copy is lowercase TPOT.
 */

"use client";

import { XIcon } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import type { HyperliquidPosition } from "@/lib/hooks/use-hyperliquid-positions";
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

/** Compact USD for the health strip: $2.0k / $1.5k rather than long decimals. */
function fmtUsdCompact(v: number | null | undefined, opts: { withSign?: boolean } = {}): string {
	if (v === null || v === undefined || !Number.isFinite(v)) return "$0";
	const sign = opts.withSign ? (v > 0 ? "+" : v < 0 ? "-" : "") : v < 0 ? "-" : "";
	const abs = Math.abs(v);
	if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}m`;
	if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
	return `${sign}$${abs.toFixed(2)}`;
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

function toneClass(tone: "positive" | "negative" | "neutral"): string {
	return tone === "positive"
		? "text-[var(--positive)]"
		: tone === "negative"
			? "text-[var(--negative)]"
			: "text-[var(--text-tertiary)]";
}

/**
 * Account-health strip for the live hyperliquid account. Four micro-stats:
 * account value, margin used (sum of per-position margin), withdrawable,
 * and total unrealized pnl. Renders above the position table so the panel
 * reads top-down: how the account is doing, then what's open.
 */
function AccountHealthStrip({
	accountValueUsd,
	withdrawableUsd,
	marginUsedUsd,
	totalUnrealizedUsd,
}: {
	accountValueUsd: number;
	withdrawableUsd: number;
	marginUsedUsd: number;
	totalUnrealizedUsd: number;
}) {
	const pnlTone = toneOfPnl(totalUnrealizedUsd);
	// Margin utilization: how much of account value is locked as margin.
	const utilPct = accountValueUsd > 0 ? Math.min(100, (marginUsedUsd / accountValueUsd) * 100) : 0;

	const cells: Array<{ label: string; value: string; tone?: "positive" | "negative" | "neutral" }> = [
		{ label: "account value", value: fmtUsd(accountValueUsd) },
		{ label: "margin used", value: fmtUsd(marginUsedUsd) },
		{ label: "withdrawable", value: fmtUsd(withdrawableUsd) },
		{
			label: "unrealized p&l",
			value: totalUnrealizedUsd === 0 ? "$0.00" : fmtUsd(totalUnrealizedUsd, { withSign: true }),
			tone: pnlTone,
		},
	];

	return (
		<div className="mb-4 rounded-md border border-[var(--border-soft)] bg-white/[0.015] p-3">
			<div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
				{cells.map((c) => (
					<div className="flex flex-col gap-1" key={c.label}>
						<span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
							{c.label}
						</span>
						<span
							className={cn(
								"font-mono text-[14px] tabular-nums leading-none",
								c.tone ? toneClass(c.tone) : "text-[var(--text-primary)]",
							)}
						>
							{c.value}
						</span>
					</div>
				))}
			</div>

			{/* Margin utilization bar. Thin, single-accent, no chrome. */}
			<div className="mt-3 flex items-center gap-2">
				<span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">margin</span>
				<div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
					<div
						className="absolute inset-y-0 left-0 rounded-full"
						style={{
							width: `${utilPct}%`,
							background: utilPct > 80 ? "var(--negative)" : utilPct > 50 ? "var(--accent-dim)" : "var(--accent)",
							boxShadow: "0 0 8px var(--accent-soft)",
						}}
					/>
				</div>
				<span className="font-mono text-[10px] tabular-nums text-[var(--text-secondary)]">{utilPct.toFixed(0)}%</span>
			</div>
		</div>
	);
}

function HyperliquidPositionsTable({ positions }: { positions: HyperliquidPosition[] }) {
	return (
		<table className="w-full border-collapse font-mono text-[11px]">
			<thead>
				<tr className="text-left text-[8.5px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					<th className="pb-2.5 pr-2 font-normal">asset</th>
					<th className="pb-2.5 pr-2 text-right font-normal">size</th>
					<th className="pb-2.5 pr-2 text-right font-normal">notional</th>
					<th className="pb-2.5 pr-2 text-right font-normal">entry</th>
					<th className="pb-2.5 pr-2 text-right font-normal">mark</th>
					<th className="pb-2.5 pr-2 text-right font-normal">liq</th>
					<th className="pb-2.5 pr-2 text-right font-normal">u-pnl</th>
					<th className="pb-2.5 text-right font-normal">close</th>
				</tr>
			</thead>
			<tbody>
				{positions.map((p) => {
					const tone = toneOfPnl(p.unrealizedPnlUsd);
					const sideCls = p.side === "long" ? "text-[var(--positive)]" : "text-[var(--negative)]";
					return (
						<tr
							className="border-t border-[var(--border-soft)] text-[var(--text-primary)] transition-colors hover:bg-white/[0.015]"
							key={`${p.coin}-${p.side}`}
						>
							<td className="py-3 pr-2">
								<div className="flex items-center gap-2">
									<TokenIcon address="" chain={chainOfVenue("hyperliquid")} size={18} symbol={primaryAssetOf(p.coin)} />
									<div className="flex flex-col gap-0.5 leading-none">
										<span className="text-[12px] text-[var(--text-primary)]">{p.coin}</span>
										<span className="flex items-center gap-1">
											<span className={cn("text-[9px] uppercase tracking-[0.1em]", sideCls)}>{p.side}</span>
											{p.leverage ? (
												<span className="rounded-sm bg-white/[0.04] px-1 text-[9px] tabular-nums text-[var(--text-secondary)]">
													{p.leverage}x
												</span>
											) : null}
										</span>
									</div>
								</div>
							</td>
							<td className="py-3 pr-2 text-right tabular-nums text-[var(--text-secondary)]">
								{fmtSize(p.coin, p.size)}
							</td>
							<td className="py-3 pr-2 text-right tabular-nums">{fmtUsd(p.notionalUsd)}</td>
							<td className="py-3 pr-2 text-right tabular-nums text-[var(--text-secondary)]">
								{p.entryPrice === null ? EMPTY_CELL : fmtUsd(p.entryPrice, { decimals: p.entryPrice >= 1000 ? 1 : 3 })}
							</td>
							<td className="py-3 pr-2 text-right tabular-nums">
								{p.currentPrice === null
									? EMPTY_CELL
									: fmtUsd(p.currentPrice, { decimals: p.currentPrice >= 1000 ? 1 : 3 })}
							</td>
							<td className="py-3 pr-2 text-right tabular-nums text-[var(--negative)]/70">
								{p.liquidationPrice === null
									? EMPTY_CELL
									: fmtUsd(p.liquidationPrice, { decimals: p.liquidationPrice >= 1000 ? 1 : 3 })}
							</td>
							<td className={cn("py-3 pr-2 text-right tabular-nums", toneClass(tone))}>
								<span className="block text-[11px]">{fmtUsd(p.unrealizedPnlUsd, { withSign: true })}</span>
								{p.unrealizedPnlPct !== null ? (
									<span className={cn("block text-[9.5px]", toneClass(tone), "opacity-70")}>
										{fmtPct(p.unrealizedPnlPct)}
									</span>
								) : null}
							</td>
							<td className="py-3 text-right">
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
 * Close-position stub. Wired to a no-op handler today; the control is
 * rendered now so the column reserves its visual space and the intended
 * UX is legible. Wires to the Steward submit-close endpoint later.
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
				"cursor-not-allowed opacity-50",
			)}
		>
			<XIcon className="h-3 w-3" />
			close
		</button>
	);
}

export function ActivePositions({
	positions,
	hyperliquidPositions = [],
	hyperliquidAccountValueUsd = 0,
	hyperliquidWithdrawableUsd = 0,
	live: livePulse = false,
}: {
	positions: Position[];
	/**
	 * Open hyperliquid perp positions from the live
	 * /hyperliquid/positions endpoint. Empty array renders the honest
	 * "no live positions" state.
	 */
	hyperliquidPositions?: HyperliquidPosition[];
	/** Total account value from the live HL snapshot (margin + free). */
	hyperliquidAccountValueUsd?: number;
	/** Withdrawable (free) collateral from the live HL snapshot. */
	hyperliquidWithdrawableUsd?: number;
	/** When true, a live pulse renders in the panel header. */
	live?: boolean;
}) {
	const live = useMemo(() => positions.filter((p) => p.status === "live"), [positions]);
	const totalPnl = useMemo(() => live.reduce((acc, p) => acc + p.pnl24h, 0), [live]);
	const tone = toneOfPnl(totalPnl);

	const hlPositions = hyperliquidPositions;
	const hlMarginUsed = useMemo(() => hlPositions.reduce((acc, p) => acc + (p.marginUsd || 0), 0), [hlPositions]);
	const hlTotalUnrealized = useMemo(() => hlPositions.reduce((acc, p) => acc + p.unrealizedPnlUsd, 0), [hlPositions]);
	const hlTotalNotional = useMemo(() => hlPositions.reduce((acc, p) => acc + p.notionalUsd, 0), [hlPositions]);
	const hlTone = toneOfPnl(hlTotalUnrealized);

	const hasHl = hlPositions.length > 0;
	const anyRows = hasHl || live.length > 0;

	return (
		<Panel className="flex h-full flex-col">
			<Label
				right={
					livePulse ? (
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
				{hasHl ? (
					<div className="mb-3">
						{/* Venue header: which book, how much working capital. */}
						<div className="mb-3 flex items-center justify-between gap-2">
							<div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
								<VenueIcon size={13} venue="hyperliquid" />
								<span>hyperliquid perp</span>
							</div>
							<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
								<span className="text-[var(--text-secondary)] tabular-nums">{fmtUsdCompact(hlTotalNotional)}</span>{" "}
								notional · {hlPositions.length} open
							</span>
						</div>

						<AccountHealthStrip
							accountValueUsd={hyperliquidAccountValueUsd}
							withdrawableUsd={hyperliquidWithdrawableUsd}
							marginUsedUsd={hlMarginUsed}
							totalUnrealizedUsd={hlTotalUnrealized}
						/>

						<HyperliquidPositionsTable positions={hlPositions} />
					</div>
				) : null}

				{live.length === 0 && !hasHl ? (
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
					<div className={cn(hasHl ? "mt-4 border-t border-[var(--border-soft)] pt-4" : "")}>
						{hasHl ? (
							<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
								other venues
							</div>
						) : null}
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
											<td className={cn("py-2.5 pr-2 text-right tabular-nums", toneClass(rowTone))}>
												{p.pnl24h === 0 ? EMPTY_CELL : fmtUsd(p.pnl24h, { withSign: true })}
											</td>
											<td className={cn("py-2.5 text-right tabular-nums", toneClass(rowTone))}>
												{p.pnl24hPct === 0 ? EMPTY_CELL : fmtPct(p.pnl24hPct)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : null}
			</div>

			<footer className="mt-3 flex items-center justify-between border-t border-[var(--border-soft)] pt-3 font-mono text-[10px] uppercase tracking-[0.18em]">
				<span className="text-[var(--text-tertiary)]">
					{hasHl ? "total unrealized p&l" : live.length === 0 ? "awaiting first venue deposit" : "total unrealized p&l"}
				</span>
				{hasHl ? (
					<span className={cn("inline-flex items-center gap-1.5 tabular-nums", toneClass(hlTone))}>
						{hlTotalUnrealized === 0 ? "$0.00" : fmtUsd(hlTotalUnrealized, { withSign: true })}
						{hlPositions.some((p) => p.unrealizedPnlPct !== null) ? (
							<span className="text-[var(--text-tertiary)]">
								({fmtPct((hlTotalUnrealized / Math.max(1, hlMarginUsed)) * 100)})
							</span>
						) : null}
					</span>
				) : live.length > 0 ? (
					<span className={cn("inline-flex items-center gap-1.5 tabular-nums", toneClass(tone))}>
						{totalPnl === 0 ? "$0.00" : fmtUsd(totalPnl, { withSign: true })}
					</span>
				) : null}
			</footer>
		</Panel>
	);
}

export default ActivePositions;
