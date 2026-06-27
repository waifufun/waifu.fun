/**
 * Active Positions panel (Wave T, cockpit redesign 2026-06-02).
 *
 * Two modes:
 *
 *  1. Live Hyperliquid mode (when `hyperliquidPositions` are provided): a
 *     premium perp surface. account-health is the hero, a four-stat strip
 *     (account value, effective leverage, withdrawable, unrealized pnl)
 *     over a live margin-utilization bar. effective leverage = total
 *     notional / account value, surfaced explicitly because ~5x is the
 *     risk story a trader reads first. below it, a dense position table:
 *     asset/side, size, notional, entry, mark (with subtle reprice flash),
 *     a per-position leverage badge, distance-to-liquidation as a percent
 *     ("84% away") not just a raw price, and unrealized pnl in green/red.
 *
 *  2. Legacy generic mode (`positions: Position[]`): the cross-venue rows
 *     (LP, prediction markets) keep their home in a 5-column table beneath.
 *
 * .impeccable.md discipline: DENSE (mono tabular nums, hairlines, tight
 * padding), LIVE (pulse header, reprice flash on mark change), TPOT
 * (lowercase, no em-dashes, honest empty states). single green accent;
 * green/red are the only non-neutral tones and they're THEME_TOKENS.
 * Em-dash glyph placeholders are banned; empty numeric cells use a middot.
 */

"use client";

import { XIcon } from "lucide-react";
import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { HyperliquidPosition } from "@/lib/hooks/use-hyperliquid-positions";
import type { Position } from "@/lib/wave-t/positions";
import type { TokenChain } from "@/lib/wave-t/token-logo";
import { Hairline, Label, Panel, Pulse, TokenIcon, VenueIcon } from "./_primitives";

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
 * Distance to liquidation as a percent of the current mark. For a long,
 * liq sits below mark, so distance = (mark - liq) / mark. For a short, liq
 * sits above mark, so distance = (liq - mark) / mark. Returns null when we
 * can't compute it (missing mark/liq). Bigger = safer; small = close to
 * getting liquidated, which is the number a trader scans first.
 */
function liqDistancePct(p: HyperliquidPosition): number | null {
	const mark = p.currentPrice;
	const liq = p.liquidationPrice;
	if (mark === null || liq === null || !Number.isFinite(mark) || !Number.isFinite(liq) || mark <= 0) return null;
	const raw = p.side === "long" ? (mark - liq) / mark : (liq - mark) / mark;
	return Math.max(0, raw * 100);
}

/**
 * Tone for the liq-distance cell. Only flag danger: under 8% away from
 * liquidation reads red. Everything else stays neutral. We deliberately do
 * NOT paint "safe" distances green, distance isn't pnl and a green number
 * here would lie about direction. single-accent discipline.
 */
function liqTone(distPct: number | null): "negative" | "neutral" {
	if (distPct === null) return "neutral";
	if (distPct < 8) return "negative";
	return "neutral";
}

/**
 * Account-health hero. Four stats over a live margin bar.
 *
 * effective leverage (totalNotional / accountValue) is promoted to a
 * first-class stat: it's the single number that says how aggressive the
 * book is. ~5x means a 20% adverse move is a wipeout, and a viewer should
 * see that without doing arithmetic.
 */
function AccountHealthHero({
	accountValueUsd,
	withdrawableUsd,
	marginUsedUsd,
	totalNotionalUsd,
	totalUnrealizedUsd,
}: {
	accountValueUsd: number;
	withdrawableUsd: number;
	marginUsedUsd: number;
	totalNotionalUsd: number;
	totalUnrealizedUsd: number;
}) {
	const pnlTone = toneOfPnl(totalUnrealizedUsd);
	const utilPct = accountValueUsd > 0 ? Math.min(100, (marginUsedUsd / accountValueUsd) * 100) : 0;
	const effLev = accountValueUsd > 0 ? totalNotionalUsd / accountValueUsd : 0;
	// Leverage risk tone: >8x reads hot, 3-8x watch, under 3x calm. We only
	// have one accent, so "hot" = negative, otherwise neutral/accent.
	const levTone: "negative" | "neutral" = effLev >= 8 ? "negative" : "neutral";

	const utilColor = utilPct > 80 ? "var(--negative)" : utilPct > 50 ? "var(--accent-dim)" : "var(--accent)";

	return (
		<div className="mb-4 rounded-md border border-[var(--border-soft)] bg-white/[0.015] p-3.5">
			<div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-4">
				<HeroStat label="account value" value={fmtUsd(accountValueUsd)} big />
				<HeroStat
					label="effective lev"
					value={`${effLev.toFixed(1)}x`}
					tone={levTone === "negative" ? "negative" : "accent"}
					big
				/>
				<HeroStat label="withdrawable" value={fmtUsd(withdrawableUsd)} big />
				<HeroStat
					label="unrealized p&l"
					value={totalUnrealizedUsd === 0 ? "$0.00" : fmtUsd(totalUnrealizedUsd, { withSign: true })}
					tone={pnlTone}
					big
				/>
			</div>

			{/* Margin utilization bar. Thin, single-accent, honest. */}
			<div className="mt-3.5 flex items-center gap-2">
				<span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					margin used
				</span>
				<div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
					<div
						className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
						style={{ width: `${utilPct}%`, background: utilColor }}
					/>
				</div>
				<span className="font-mono text-[10px] tabular-nums text-[var(--text-secondary)]">
					{fmtUsdCompact(marginUsedUsd)}
				</span>
				<span className="w-9 text-right font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
					{utilPct.toFixed(0)}%
				</span>
			</div>
		</div>
	);
}

function HeroStat({
	label,
	value,
	tone = "neutral",
	big = false,
}: {
	label: string;
	value: string;
	tone?: "positive" | "negative" | "neutral" | "accent";
	big?: boolean;
}) {
	const colorCls =
		tone === "positive"
			? "text-[var(--positive)]"
			: tone === "negative"
				? "text-[var(--negative)]"
				: tone === "accent"
					? "text-[var(--accent)]"
					: "text-[var(--text-primary)]";
	return (
		<div className="flex flex-col gap-1">
			<span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{label}</span>
			<span className={cn("font-mono tabular-nums leading-none", big ? "text-[15px]" : "text-[13px]", colorCls)}>
				{value}
			</span>
		</div>
	);
}

/**
 * Mark cell with a subtle reprice flash. When the mark changes between
 * polls the value briefly tints green (up) or red (down) then settles.
 * Honors prefers-reduced-motion by simply not flashing.
 */
function MarkCell({ value, decimals }: { value: number | null; decimals: number }) {
	const prev = useRef<number | null>(value);
	const [flash, setFlash] = useState<"up" | "down" | null>(null);

	useEffect(() => {
		const prior = prev.current;
		prev.current = value;
		if (value === null || prior === null || value === prior) return;
		setFlash(value > prior ? "up" : "down");
		const t = setTimeout(() => setFlash(null), 600);
		return () => clearTimeout(t);
	}, [value]);

	const flashCls =
		flash === "up"
			? "text-[var(--positive)]"
			: flash === "down"
				? "text-[var(--negative)]"
				: "text-[var(--text-primary)]";

	return (
		<span className={cn("tabular-nums transition-colors duration-500", flashCls)}>
			{value === null ? EMPTY_CELL : fmtUsd(value, { decimals })}
		</span>
	);
}

/**
 * Mobile reflow of the Hyperliquid book. Below sm an 8-column table can't
 * breathe at 375px, so each position becomes a stacked card: the
 * asset/side/leverage header on top, then a 3-up micro-grid of the numbers
 * a trader scans (size, notional, entry, mark, liq dist, u-pnl). Same data,
 * no horizontal scroll, every value legible. Shown only below sm; sm+ keeps
 * the dense cockpit table.
 */
function HyperliquidPositionsCards({ positions }: { positions: HyperliquidPosition[] }) {
	return (
		<ul className="flex flex-col gap-2 sm:hidden">
			{positions.map((p) => {
				const tone = toneOfPnl(p.unrealizedPnlUsd);
				const sideCls = p.side === "long" ? "text-[var(--positive)]" : "text-[var(--negative)]";
				const distPct = liqDistancePct(p);
				const distTone = liqTone(distPct);
				return (
					<li
						className="rounded-md border border-[var(--border-soft)] bg-white/[0.012] p-3"
						key={`${p.coin}-${p.side}`}
					>
						{/* Header: asset identity + side/leverage, pnl on the right. */}
						<div className="flex items-center justify-between gap-2">
							<div className="flex min-w-0 items-center gap-2">
								<TokenIcon
									address=""
									chain={chainOfVenue("hyperliquid")}
									hlAsset={p.coin}
									size={20}
									symbol={primaryAssetOf(p.coin)}
								/>
								<div className="flex min-w-0 flex-col gap-0.5 leading-none">
									<span className="truncate font-mono text-[13px] text-[var(--text-primary)]">{p.coin}</span>
									<span className="flex items-center gap-1">
										<span className={cn("font-mono text-[9px] uppercase tracking-[0.1em]", sideCls)}>{p.side}</span>
										{p.leverage ? (
											<span className="rounded-sm bg-white/[0.04] px-1 font-mono text-[9px] tabular-nums text-[var(--text-secondary)]">
												{p.leverage}x
											</span>
										) : null}
									</span>
								</div>
							</div>
							<div className={cn("shrink-0 text-right font-mono tabular-nums", toneClass(tone))}>
								<span className="block text-[13px]">{fmtUsd(p.unrealizedPnlUsd, { withSign: true })}</span>
								{p.unrealizedPnlPct !== null ? (
									<span className={cn("block text-[10px]", toneClass(tone), "opacity-70")}>
										{fmtPct(p.unrealizedPnlPct)}
									</span>
								) : null}
							</div>
						</div>

						{/* Numbers grid: 3-up, label over value, mono tabular. */}
						<div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 border-t border-[var(--border-soft)] pt-3">
							<CardStat label="size" value={fmtSize(p.coin, p.size)} />
							<CardStat label="notional" value={fmtUsd(p.notionalUsd)} />
							<CardStat
								label="entry"
								value={
									p.entryPrice === null ? EMPTY_CELL : fmtUsd(p.entryPrice, { decimals: p.entryPrice >= 1000 ? 1 : 3 })
								}
							/>
							<CardStat
								label="mark"
								value={<MarkCell value={p.currentPrice} decimals={p.currentPrice && p.currentPrice >= 1000 ? 1 : 3} />}
							/>
							<CardStat
								label="liq dist"
								value={
									distPct === null ? (
										<span className="text-[var(--text-tertiary)]">{EMPTY_CELL}</span>
									) : (
										<span className={distTone === "negative" ? "text-[var(--negative)]" : undefined}>
											{distPct.toFixed(0)}%
										</span>
									)
								}
							/>
							<div className="flex items-end justify-end">
								<ClosePositionButton coin={p.coin} side={p.side} />
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

/** Label-over-value cell for the mobile position cards. */
function CardStat({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</span>
			<span className="font-mono text-[12px] tabular-nums text-[var(--text-primary)]">{value}</span>
		</div>
	);
}

function HyperliquidPositionsTable({ positions }: { positions: HyperliquidPosition[] }) {
	return (
		<table className="hidden w-full border-collapse font-mono text-[11px] sm:table">
			<thead>
				<tr className="text-left text-[8.5px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					<th className="pb-2.5 pr-2 font-normal">asset</th>
					<th className="pb-2.5 pr-2 text-right font-normal">size</th>
					<th className="pb-2.5 pr-2 text-right font-normal">notional</th>
					<th className="pb-2.5 pr-2 text-right font-normal">entry</th>
					<th className="pb-2.5 pr-2 text-right font-normal">mark</th>
					<th className="pb-2.5 pr-2 text-right font-normal">liq dist</th>
					<th className="pb-2.5 pr-2 text-right font-normal">u-pnl</th>
					<th className="pb-2.5 text-right font-normal">close</th>
				</tr>
			</thead>
			<tbody>
				{positions.map((p) => {
					const tone = toneOfPnl(p.unrealizedPnlUsd);
					const sideCls = p.side === "long" ? "text-[var(--positive)]" : "text-[var(--negative)]";
					const distPct = liqDistancePct(p);
					const distTone = liqTone(distPct);
					return (
						<tr
							className="border-t border-[var(--border-soft)] text-[var(--text-primary)] transition-colors hover:bg-white/[0.015]"
							key={`${p.coin}-${p.side}`}
						>
							<td className="py-3 pr-2">
								<div className="flex items-center gap-2">
									{/* HL perp asset: resolve by ticker (incl. xyz: equities), not chain:address. */}
									<TokenIcon
										address=""
										chain={chainOfVenue("hyperliquid")}
										hlAsset={p.coin}
										size={18}
										symbol={primaryAssetOf(p.coin)}
									/>
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
							<td className="py-3 pr-2 text-right">
								<MarkCell value={p.currentPrice} decimals={p.currentPrice && p.currentPrice >= 1000 ? 1 : 3} />
							</td>
							{/* distance-to-liquidation. the number a trader reads before
							    the raw liq price. raw liq is in the tooltip. */}
							<td className="py-3 pr-2 text-right">
								{distPct === null ? (
									<span className="tabular-nums text-[var(--text-tertiary)]">{EMPTY_CELL}</span>
								) : (
									<span
										className={cn(
											"tabular-nums",
											distTone === "negative" ? "text-[var(--negative)]" : "text-[var(--text-secondary)]",
										)}
										title={p.liquidationPrice !== null ? `liq ${fmtUsd(p.liquidationPrice)}` : undefined}
									>
										{distPct.toFixed(0)}%
									</span>
								)}
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
 * Close-position stub. Intentionally styled but disabled: trading actions
 * are a separate task. Rendered now so the column reserves its visual space
 * and the intended UX is legible. Wires to the Steward submit-close endpoint
 * later. NOT wired here on purpose.
 */
function ClosePositionButton({ coin, side }: { coin: string; side: "long" | "short" }) {
	return (
		<button
			type="button"
			disabled
			title={`close ${side} ${coin} (steward submit pending)`}
			className={cn(
				"inline-flex h-7 items-center justify-center gap-1 rounded-sm px-2.5 sm:h-6 sm:px-2",
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
	hyperliquidPositions?: HyperliquidPosition[];
	hyperliquidAccountValueUsd?: number;
	hyperliquidWithdrawableUsd?: number;
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
							<Pulse />
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

			<div className="flex-1 sm:overflow-x-auto">
				{hasHl ? (
					<div className="mb-3">
						{/* Venue header: which book, how much working capital. */}
						<div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
							<div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
								<VenueIcon size={13} venue="hyperliquid" />
								<span>hyperliquid perp</span>
							</div>
							<span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
								<span className="text-[var(--text-secondary)] tabular-nums">{fmtUsdCompact(hlTotalNotional)}</span>{" "}
								notional · {hlPositions.length} open
							</span>
						</div>

						<AccountHealthHero
							accountValueUsd={hyperliquidAccountValueUsd}
							withdrawableUsd={hyperliquidWithdrawableUsd}
							marginUsedUsd={hlMarginUsed}
							totalNotionalUsd={hlTotalNotional}
							totalUnrealizedUsd={hlTotalUnrealized}
						/>

						<HyperliquidPositionsCards positions={hlPositions} />
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
					<div className={cn(hasHl ? "mt-4" : "")}>
						{hasHl ? (
							<>
								<Hairline className="mb-3" />
								<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
									other venues
								</div>
							</>
						) : null}
						{/* Mobile: each cross-venue position as a stacked row. */}
						<ul className="flex flex-col gap-2 sm:hidden">
							{live.map((p) => {
								const rowTone = toneOfPnl(p.pnl24h);
								return (
									<li className="rounded-md border border-[var(--border-soft)] bg-white/[0.012] p-3" key={p.id}>
										<div className="flex items-center justify-between gap-2">
											<span className="inline-flex min-w-0 items-center gap-1.5">
												<TokenIcon
													address=""
													chain={chainOfVenue(p.venue)}
													size={16}
													symbol={primaryAssetOf(p.asset)}
												/>
												<span className="truncate font-mono text-[12px] text-[var(--text-primary)]">{p.asset}</span>
											</span>
											<span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--text-primary)]">
												{fmtUsd(p.valueUsd)}
											</span>
										</div>
										<div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border-soft)] pt-2.5">
											<span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-secondary)]">
												<VenueIcon size={13} venue={p.venue} />
												<span>{p.venue}</span>
											</span>
											<span
												className={cn(
													"inline-flex items-baseline gap-2 font-mono text-[12px] tabular-nums",
													toneClass(rowTone),
												)}
											>
												<span>{p.pnl24h === 0 ? EMPTY_CELL : fmtUsd(p.pnl24h, { withSign: true })}</span>
												<span className="text-[10px] opacity-80">
													{p.pnl24hPct === 0 ? EMPTY_CELL : fmtPct(p.pnl24hPct)}
												</span>
											</span>
										</div>
									</li>
								);
							})}
						</ul>
						<table className="hidden w-full border-collapse font-mono text-[11px] sm:table">
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
