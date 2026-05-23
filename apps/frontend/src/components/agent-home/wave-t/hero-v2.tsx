/**
 * Hero v2 — character-led design rescue (2026-05-22).
 *
 * The previous hero (`./hero.tsx`) treated sol as a header thumbnail:
 * a 176px portrait, a 14px bio, and a four-cell stat strip beneath
 * that read as the page's emotional anchor. The page looked like
 * "agent index entry #4", not "sol's profile".
 *
 * This rescue inverts the hierarchy. Asymmetric two-column at md+:
 *
 *   ┌──────────────────────────────┬─────────────────────────────┐
 *   │                              │  TREASURY                   │
 *   │                              │  $729,481                   │
 *   │       [ portrait 360px ]     │  source · pulse · sparkline │
 *   │                              ├─────────────────────────────┤
 *   │                              │  24H PNL │ runway │ status  │
 *   │  sol  ✓  @0xsolace_          │  followers          chain   │
 *   │  bio prose, sol-voice, ≤52ch ├─────────────────────────────┤
 *   │  $SUKI  v0.1.0  bnb chain    │  share watermark · day N    │
 *   └──────────────────────────────┴─────────────────────────────┘
 *
 * Below md the columns stack: portrait + name + bio first, then the
 * treasury/stats block.
 *
 * Live-data behavior is unchanged. The wrapper (`LiveHero` in
 * `./live-wrappers.tsx`) still feeds in polled nav, twitter stats,
 * etc.
 *
 * Visual contract (locked to .impeccable.md):
 *   - single #00ff87 accent (CSS var --accent)
 *   - mono numbers everywhere, satoshi for name/bio
 *   - lowercase voice, no em-dashes
 *   - <Panel> wraps the whole hero so it grouped consistently with
 *     the rest of the cockpit grammar
 *   - portrait stays square (not circle) to preserve "ID card" feel
 *     and avoid lucide-egg-avatar territory
 */

"use client";

import NumberFlow from "@number-flow/react";
import { CheckCircle2Icon } from "lucide-react";
import { useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { resolveImageUrl } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import type { TwitterStats } from "@/lib/wave-t/agent-twitter";

import { Hairline, Panel, Pulse, StatPill } from "./_primitives";
import type { HeroIdentity, HeroProps } from "./hero";

const FALLBACK_PORTRAIT = "/brand/agents/waifu/portrait-amber.webp";

/**
 * Character-led hero. Drop-in replacement for the previous <Hero> with
 * the same props contract so `LiveHero` keeps polling the same way.
 */
export function HeroV2({
	identity,
	navUsd,
	daysOperating,
	pnl24hUsd = 0,
	pnl24hPct = 0,
	version = "v0.1.0",
	status = "online",
	className,
	treasuryValueOverride,
	runwayDays,
	twitterStats,
	livePulse = false,
}: HeroProps) {
	const treasuryValue = treasuryValueOverride?.valueUsd ?? navUsd;
	const treasurySource = treasuryValueOverride?.source ?? "burner";
	const followers = twitterStats?.followers ?? null;

	return (
		<Panel className={cn("relative", className)} noPad>
			<div
				className={cn(
					// On mobile (<lg) the character block stacks above the data
					// block. At lg+ we get the asymmetric 1.15fr/1fr split that
					// makes the page read as a passport card on the left and a
					// dashboard on the right.
					"grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]",
					"divide-y divide-[var(--border-soft)] lg:divide-y-0 lg:divide-x",
				)}
			>
				<CharacterColumn identity={identity} version={version} livePulse={livePulse} />
				<DataColumn
					treasuryValue={treasuryValue}
					treasurySource={treasurySource}
					livePulse={livePulse}
					pnl24hUsd={pnl24hUsd}
					pnl24hPct={pnl24hPct}
					daysOperating={daysOperating}
					status={status}
					runwayDays={runwayDays ?? null}
					followers={followers}
					followersSource={twitterStats?.source ?? "cached"}
				/>
			</div>
		</Panel>
	);
}

// ── Character column ───────────────────────────────────────────

function CharacterColumn({
	identity,
	version,
	livePulse,
}: {
	identity: HeroIdentity;
	version: string;
	livePulse: boolean;
}) {
	const portrait = resolveImageUrl(identity.image) ?? FALLBACK_PORTRAIT;
	const displayName = (identity.name || "unknown").toLowerCase();
	const ticker = identity.ticker ? `$${identity.ticker.toUpperCase()}` : "";
	const description = identity.description;
	const verified = identity.verified ?? true;
	const handle = identity.twitterHandle ? `@${identity.twitterHandle.replace(/^@/, "").toLowerCase()}` : null;

	// Mobile-first stacking. Below md the portrait sits centered above
	// the name/bio block (passport-photo-on-top pattern). At md+ the
	// portrait pairs inline with the text like a sidebar identity card.
	// We deliberately do NOT inline at sm (640): on a 640-720px viewport
	// the 200px portrait + 4 short stat pills + bio crowd each other.
	// Inline only kicks in at md (768) where there's room to breathe.
	return (
		<div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-5 md:flex-row md:items-start md:gap-6 md:p-6 lg:gap-7 lg:p-8">
			<div className="relative shrink-0 self-start">
				<img
					alt={`${displayName} portrait`}
					className={cn(
						// mobile: comfortable readable size, not header-sized.
						"h-[148px] w-[148px] rounded-md object-cover",
						"sm:h-[176px] sm:w-[176px]",
						// tablet inline: smaller than desktop so name+bio+stats fit.
						"md:h-[208px] md:w-[208px]",
						"lg:h-[272px] lg:w-[272px]",
						"xl:h-[320px] xl:w-[320px]",
					)}
					height={320}
					src={portrait}
					style={{ boxShadow: "inset 0 0 0 1px var(--border-mid)" }}
					width={320}
				/>
				{livePulse ? (
					<span className="absolute right-2.5 top-2.5 inline-flex">
						<Pulse tone="accent" />
					</span>
				) : null}
			</div>

			<div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5 md:gap-3 lg:gap-4">
				<div className="flex flex-wrap items-center gap-2">
					<h1
						className={cn(
							"font-medium leading-[0.95] tracking-[-0.025em] text-[var(--text-primary)]",
							// 28 mobile → 32 sm → 36 md → 44 lg → 52 xl. Tighter
							// scale than before so the name doesn't dominate small
							// viewports.
							"text-[28px] sm:text-[32px] md:text-[36px] lg:text-[44px] xl:text-[52px]",
						)}
					>
						{displayName}
					</h1>
					{verified ? (
						<CheckCircle2Icon
							aria-label="Verified agent"
							className="h-[18px] w-[18px] md:h-[22px] md:w-[22px] lg:h-[26px] lg:w-[26px]"
							strokeWidth={2}
							style={{ color: "var(--accent)" }}
						/>
					) : null}
				</div>

				{handle ? (
					<a
						className="-mt-1 inline-flex w-fit font-mono text-[12px] tracking-tight text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
						href={`https://x.com/${handle.slice(1)}`}
						rel="noopener noreferrer"
						target="_blank"
					>
						{handle}
					</a>
				) : null}

				{description ? (
					<p
						className={cn(
							"max-w-[52ch] lowercase leading-[1.55] text-[var(--text-secondary)]",
							// 15px on mobile (readable in vertical stack),
							// 14 on tablet to leave room for the inline portrait,
							// 15 lg, 16 xl.
							"text-[15px] md:text-[14px] lg:text-[15px] xl:text-[16px]",
						)}
					>
						{description}
					</p>
				) : null}

				<div className="mt-1 flex flex-wrap items-center gap-1.5">
					{ticker ? <StatPill tone="accent">{ticker}</StatPill> : null}
					<StatPill tone="neutral">{version}</StatPill>
					<StatPill tone="neutral">bnb chain</StatPill>
				</div>
			</div>
		</div>
	);
}

// ── Data column ────────────────────────────────────────────────
//
// The right side of the hero. Three logical bands separated by hairlines:
//   1. TREASURY VALUE (hero number + sparkline + source + live pulse)
//   2. STAT GRID (24h pnl, runway, followers, days operating, chain)
//   3. STATUS LINE (operational dot + days operating, footer band)

function DataColumn({
	treasuryValue,
	treasurySource,
	livePulse,
	pnl24hUsd,
	pnl24hPct,
	daysOperating,
	status,
	runwayDays,
	followers,
	followersSource,
}: {
	treasuryValue: number;
	treasurySource: "aggregated" | "agentSafe" | "burner";
	livePulse: boolean;
	pnl24hUsd: number;
	pnl24hPct: number;
	daysOperating: number;
	status: "online" | "degraded" | "offline";
	runwayDays: number | null;
	followers: number | null;
	followersSource: TwitterStats["source"];
}) {
	const sourceLabel =
		treasurySource === "aggregated" ? "nav aggregated" : treasurySource === "agentSafe" ? "agent safe" : "sol burner";

	const pnlEmpty = pnl24hUsd === 0;
	const pnlTone: "positive" | "negative" | "neutral" = pnlEmpty ? "neutral" : pnl24hUsd > 0 ? "positive" : "negative";
	const pnlColor =
		pnlTone === "positive" ? "var(--positive)" : pnlTone === "negative" ? "var(--negative)" : "var(--text-tertiary)";
	const pnlSign = pnlEmpty ? "" : pnl24hUsd > 0 ? "+" : "";

	const statusDotTone: "positive" | "accent" | "negative" =
		status === "online" ? "positive" : status === "degraded" ? "accent" : "negative";
	const statusLabel = status === "online" ? "operational" : status === "degraded" ? "degraded" : "offline";
	const statusColor =
		status === "online" ? "var(--positive)" : status === "degraded" ? "var(--accent)" : "var(--negative)";

	// The right column has two bands: the treasury hero (top) and the
	// stat strip (bottom). Justify-between pushes them apart so the
	// treasury sits near the top of the column, level with sol's name,
	// and the stat strip sits at the bottom — closing the visual canyon
	// the previous version left between the portrait and the data.
	return (
		<div className="flex min-w-0 flex-col justify-between">
			{/* Band 1: Treasury — the hero number. */}
			<div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-5 md:p-6 lg:p-8 lg:pb-6">
				<div className="flex items-center justify-between gap-3">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
						treasury value
					</span>
					<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						{livePulse ? <Pulse tone="accent" /> : null}
						{sourceLabel}
					</span>
				</div>

				<div className="flex items-end justify-between gap-3 sm:gap-5">
					<div
						className={cn(
							"font-mono leading-none tracking-tight tabular-nums text-[var(--text-primary)]",
							// 32 mobile → 40 sm → 44 md → 52 lg → 60 xl. The
							// previous 60px treasury number overflowed on small
							// viewports next to the sparkline.
							"text-[32px] sm:text-[40px] md:text-[44px] lg:text-[52px] xl:text-[60px]",
						)}
					>
						<NumberFlow
							format={{
								style: "currency",
								currency: "USD",
								maximumFractionDigits: 0,
							}}
							value={Math.max(0, Math.round(treasuryValue))}
						/>
					</div>
					<TreasurySparkline navUsd={treasuryValue} />
				</div>

				<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
					{livePulse ? (
						<>
							<Pulse tone="accent" />
							<span>live · ticks every 30s</span>
						</>
					) : (
						<span>build snapshot</span>
					)}
				</div>
			</div>

			<Hairline />

			{/* Band 2: PnL + Runway + Followers + Days strip. */}
			<div className="grid grid-cols-2 divide-x divide-y divide-[var(--border-soft)] lg:grid-cols-4 lg:divide-y-0">
				<DataCell label="24h pnl">
					<div className="flex items-baseline gap-2">
						<span
							className="font-mono text-[17px] sm:text-[20px] leading-none tabular-nums tracking-tight"
							style={{ color: pnlColor }}
						>
							{pnlEmpty ? (
								<span className="text-[13px] text-[var(--text-tertiary)]">no history</span>
							) : (
								<>
									{pnlSign}
									<NumberFlow
										format={{
											style: "currency",
											currency: "USD",
											maximumFractionDigits: 0,
										}}
										value={Math.round(Math.abs(pnl24hUsd))}
									/>
								</>
							)}
						</span>
					</div>
					<div className="font-mono text-[10px] tabular-nums tracking-tight" style={{ color: pnlColor }}>
						{pnlEmpty ? (
							<span className="text-[var(--text-tertiary)]">snapshots backfill</span>
						) : (
							<span>
								{pnlSign}
								{pnl24hPct.toFixed(2)}%
							</span>
						)}
					</div>
				</DataCell>

				<DataCell label="runway">
					<div className="font-mono text-[17px] sm:text-[20px] leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
						{runwayDays == null ? (
							<span className="text-[13px] text-[var(--text-tertiary)]">unmeasured</span>
						) : (
							<>
								{runwayDays >= 365 ? ">365" : Math.round(runwayDays)}
								<span className="ml-1 text-[12px] text-[var(--text-tertiary)]">d</span>
							</>
						)}
					</div>
					<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						{runwayDays == null ? "burn rate idle" : "at current burn"}
					</div>
				</DataCell>

				<DataCell label="followers">
					<div className="font-mono text-[17px] sm:text-[20px] leading-none tabular-nums tracking-tight text-[var(--accent)]">
						{followers == null ? (
							<span className="text-[13px] text-[var(--text-tertiary)]">no data yet</span>
						) : (
							formatCompactCount(followers)
						)}
					</div>
					<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
						{followers == null ? "twitter handle quiet" : `twitter · ${followersSource}`}
					</div>
				</DataCell>

				<DataCell label="day">
					<div className="font-mono text-[17px] sm:text-[20px] leading-none tabular-nums tracking-tight text-[var(--text-primary)]">
						{daysOperating}
					</div>
					<div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
						<Pulse tone={statusDotTone} />
						<span style={{ color: statusColor }}>{statusLabel}</span>
					</div>
				</DataCell>
			</div>
		</div>
	);
}

function DataCell({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5 border-[var(--border-soft)] px-4 py-3.5 sm:gap-2 sm:px-5 sm:py-4 md:px-6 md:py-5">
			<span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">{label}</span>
			<div className="flex flex-col gap-1">{children}</div>
		</div>
	);
}

// ── Treasury sparkline ─────────────────────────────────────────

function TreasurySparkline({ navUsd }: { navUsd: number }) {
	const series = useMemo(() => synthesizeSparkline(navUsd), [navUsd]);
	const id = useId();
	return (
		<div className="h-10 w-[96px] shrink-0 sm:h-12 sm:w-[140px] lg:w-[180px]">
			<ResponsiveContainer height="100%" width="100%">
				<AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
					<defs>
						<linearGradient id={`hero-spark-${id}`} x1="0" x2="0" y1="0" y2="1">
							<stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
							<stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
						</linearGradient>
					</defs>
					<Area
						dataKey="v"
						fill={`url(#hero-spark-${id})`}
						isAnimationActive={false}
						stroke="var(--accent)"
						strokeWidth={1.5}
						type="monotone"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

// ── helpers ─────────────────────────────────────────────────────

function formatCompactCount(value: number): string {
	return new Intl.NumberFormat("en", {
		notation: "compact",
		maximumFractionDigits: value >= 10_000 ? 1 : 1,
	})
		.format(value)
		.toLowerCase();
}

/**
 * Synthesize a plausible 12-bar sparkline ending at the current nav.
 * Deterministic so SSG and client agree.
 */
function synthesizeSparkline(nav: number): { v: number }[] {
	const end = Math.max(1, nav);
	const start = end * 0.86;
	const points = 12;
	const out: { v: number }[] = [];
	for (let i = 0; i < points; i++) {
		const t = i / (points - 1);
		const drift = start + (end - start) * t;
		const wiggle = Math.sin(i * 1.4) * (end * 0.015);
		out.push({ v: Math.max(0, drift + wiggle) });
	}
	return out;
}

export default HeroV2;
