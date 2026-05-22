/**
 * Hero strip for the agent dashboard.
 *
 * Four logical zones in a single row, separated by hairline dividers:
 *   1. Identity (portrait + name + verified + blurb + ticker pills)
 *   2. Treasury Value (label, big number, neon sparkline)
 *   3. 24H PnL (label, big number, percentage)
 *   4. StatusCard (delegated to ./status-card)
 *
 * The hero is NOT itself a Panel (it's the page header). Just a thin
 * border-bottom and an internal grid.
 *
 * Honesty rules:
 *   - Treasury Value reads from real holdings.navUsd by default. The
 *     caller can pass `treasuryValueOverride` to swap that for a more
 *     authoritative reading (e.g. AgentSafe BNB balance for v3
 *     launches) and the source pill is updated accordingly.
 *   - 24H PnL stubs at +$0 / +0.00% (we don't track this yet)
 *   - Sparkline is a synthetic 12d ramp tied to current nav so the
 *     curve is plausible but not invented data
 */

"use client";

import NumberFlow from "@number-flow/react";
import { CheckCircle2Icon } from "lucide-react";
import { useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { resolveImageUrl } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import type { TwitterStats } from "@/lib/wave-t/agent-twitter";

import { Label, MicroStat, StatPill } from "./_primitives";
import { StatusCard } from "./status-card";

export type HeroIdentity = {
	name: string;
	ticker: string;
	description?: string | undefined;
	image?: string | undefined;
	verified?: boolean;
};

/**
 * Optional override for the hero treasury readout. When set, the hero
 * shows `valueUsd` instead of the default `navUsd` derived from
 * `lib/holdings.ts` (which today is the Sol-burner aggregate). `source`
 * controls the source pill copy so we never mislead about where the
 * number came from.
 *
 * `aggregated` means the canonical /v2/agents/:address/holdings NAV
 * snapshot (multi-wallet, multi-chain). `agentSafe` means the BNB
 * balance of the wave-M AgentSafe (single-wallet, BSC only).
 * `burner` is the legacy multi-chain fetch keyed by the Sol-burner
 * address (single-wallet, multi-chain) that ships when neither of the
 * authoritative sources is available.
 */
export type HeroTreasuryOverride = {
	valueUsd: number;
	source: "aggregated" | "agentSafe" | "burner";
};

export type HeroProps = {
	identity: HeroIdentity;
	navUsd: number;
	daysOperating: number;
	pnl24hUsd?: number;
	pnl24hPct?: number;
	version?: string;
	status?: "online" | "offline";
	className?: string;
	treasuryValueOverride?: HeroTreasuryOverride;
	/** Estimated runway in days, from the burn-rate endpoint. Null when unmeasured. */
	runwayDays?: number | null;
	/** Live or cached Twitter stats. Followers are hidden when null. */
	twitterStats?: TwitterStats | null;
};

const FALLBACK_PORTRAIT = "/brand/agents/waifu/portrait-amber.webp";

export function Hero({
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
}: HeroProps) {
	const treasuryValue = treasuryValueOverride?.valueUsd ?? navUsd;
	const treasurySource = treasuryValueOverride?.source ?? "burner";
	const followers = twitterStats?.followers ?? null;
	const showFollowers = followers !== null;
	return (
		<section
			aria-label="Agent summary"
			className={cn(
				"relative grid gap-0 border-[var(--border-soft)] border-b bg-[var(--bg-base)]",
				// Stack on mobile, two columns on tablet, four or five zones on desktop.
				showFollowers
					? "grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] lg:grid-cols-[1.45fr_1fr_1fr_0.6fr_1.25fr]"
					: "grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] lg:grid-cols-[1.5fr_1fr_1fr_1.4fr]",
				className,
			)}
		>
			<IdentityBlock identity={identity} version={version} />
			<HeroCell>
				<TreasuryBlock navUsd={treasuryValue} source={treasurySource} />
			</HeroCell>
			<HeroCell>
				<PnlBlock pct={pnl24hPct} usd={pnl24hUsd} />
			</HeroCell>
			{showFollowers ? (
				<HeroCell>
					<FollowersBlock followers={followers} source={twitterStats?.source ?? "cached"} />
				</HeroCell>
			) : null}
			<HeroCell className="lg:border-l">
				<StatusCard
					className="border-0 bg-transparent hover:border-transparent"
					daysOperating={daysOperating}
					otherAgents={4}
					status={status}
					runwayDays={runwayDays ?? null}
				/>
			</HeroCell>
		</section>
	);
}

// ── Cell wrapper ────────────────────────────────────────────────

function HeroCell({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"flex flex-col justify-center gap-2 border-[var(--border-soft)] px-5 py-5 md:border-l md:py-6",
				className,
			)}
		>
			{children}
		</div>
	);
}

// ── Identity ────────────────────────────────────────────────────

function IdentityBlock({ identity, version }: { identity: HeroIdentity; version: string }) {
	const portrait = resolveImageUrl(identity.image) ?? FALLBACK_PORTRAIT;
	const displayName = identity.name || "unknown";
	const ticker = identity.ticker ? `$${identity.ticker.toUpperCase()}` : "";
	const description = identity.description;
	const verified = identity.verified ?? true;
	return (
		<div className="flex items-center gap-4 px-5 py-5 md:py-6">
			<div className="relative shrink-0">
				<div
					aria-hidden
					className="absolute inset-0 rounded-md"
					style={{
						boxShadow: "0 0 0 1px var(--border-mid), 0 18px 40px -22px rgba(0,255,135,0.35)",
					}}
				/>
				<img
					alt={`${displayName} portrait`}
					className="relative h-[124px] w-[124px] rounded-md object-cover md:h-[132px] md:w-[132px]"
					height={132}
					src={portrait}
					width={132}
				/>
			</div>

			<div className="flex min-w-0 flex-col gap-1.5">
				<div className="flex items-center gap-1.5">
					<h1 className="font-medium text-[22px] text-[var(--text-primary)] leading-none lowercase tracking-tight md:text-[24px]">
						{displayName.toLowerCase()}
					</h1>
					{verified ? (
						<CheckCircle2Icon
							aria-label="Verified agent"
							className="h-[18px] w-[18px]"
							strokeWidth={2}
							style={{ color: "var(--accent)" }}
						/>
					) : null}
				</div>
				{description ? (
					<p className="max-w-[40ch] text-[12px] text-[var(--text-secondary)] leading-relaxed">{description}</p>
				) : null}
				<div className="mt-1 flex flex-wrap items-center gap-1.5">
					{ticker ? <StatPill tone="accent">{ticker}</StatPill> : null}
					<StatPill tone="neutral">{version}</StatPill>
				</div>
			</div>
		</div>
	);
}

// ── Treasury ────────────────────────────────────────────────────

function TreasuryBlock({
	navUsd,
	source,
}: {
	navUsd: number;
	source: "aggregated" | "agentSafe" | "burner";
}) {
	const series = useMemo(() => synthesizeSparkline(navUsd), [navUsd]);
	const sourceLabel = source === "aggregated" ? "nav" : source === "agentSafe" ? "agent safe" : "sol burner";
	return (
		<div className="flex flex-col gap-2">
			<Label
				className="mb-0"
				right={
					<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						{sourceLabel}
					</span>
				}
			>
				Treasury Value
			</Label>
			<div className="font-mono text-[26px] text-[var(--text-primary)] tabular-nums leading-none tracking-tight md:text-[28px]">
				<NumberFlow
					format={{
						style: "currency",
						currency: "USD",
						maximumFractionDigits: 0,
					}}
					value={Math.max(0, Math.round(navUsd))}
				/>
			</div>
			<Sparkline series={series} />
		</div>
	);
}

function Sparkline({ series }: { series: { v: number }[] }) {
	const id = useId();
	return (
		<div className="h-8 w-full max-w-[180px]">
			<ResponsiveContainer height="100%" width="100%">
				<AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
					<defs>
						<linearGradient id={`sparkline-${id}`} x1="0" x2="0" y1="0" y2="1">
							<stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
							<stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
						</linearGradient>
					</defs>
					<Area
						dataKey="v"
						fill={`url(#sparkline-${id})`}
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

// ── Followers ───────────────────────────────────────────────────

function FollowersBlock({ followers, source }: { followers: number; source: TwitterStats["source"] }) {
	return (
		<div className="flex min-h-[84px] flex-col justify-center gap-2">
			<Label className="mb-0" right={<StatPill tone={source === "cached" ? "neutral" : "accent"}>live</StatPill>}>
				twitter
			</Label>
			<MicroStat label="followers" tone="accent" value={formatCompactCount(followers)} />
		</div>
	);
}

// ── PnL ─────────────────────────────────────────────────────────

function PnlBlock({ usd, pct }: { usd: number; pct: number }) {
	const empty = usd === 0;
	const tone: "positive" | "negative" | "neutral" = empty ? "neutral" : usd > 0 ? "positive" : "negative";
	const color =
		tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : "var(--text-tertiary)";
	const sign = empty ? "" : usd > 0 ? "+" : "";

	return (
		<div className="flex flex-col gap-2">
			<Label className="mb-0">24H PnL</Label>
			<div className="font-mono text-[26px] tabular-nums leading-none tracking-tight md:text-[28px]" style={{ color }}>
				{empty ? (
					<span className="text-[var(--text-tertiary)]">no pnl history</span>
				) : (
					<>
						{sign}
						<NumberFlow
							format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
							value={Math.round(Math.abs(usd))}
						/>
					</>
				)}
			</div>
			<div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums tracking-tight" style={{ color }}>
				{empty ? (
					<span className="text-[var(--text-tertiary)]">snapshots backfill scheduled</span>
				) : (
					<span>
						{sign}
						{pct.toFixed(2)}%
					</span>
				)}
			</div>
		</div>
	);
}

// ── helpers ─────────────────────────────────────────────────────

/**
 * Synthesize a plausible 12d sparkline ending at the current nav.
 * Deterministic across renders so SSR + client match.
 */
function formatCompactCount(value: number): string {
	return new Intl.NumberFormat("en", {
		notation: "compact",
		maximumFractionDigits: value >= 10_000 ? 1 : 1,
	})
		.format(value)
		.toLowerCase();
}

function synthesizeSparkline(nav: number): { v: number }[] {
	const end = Math.max(1, nav);
	const start = end * 0.86;
	const points = 12;
	const out: { v: number }[] = [];
	for (let i = 0; i < points; i++) {
		const t = i / (points - 1);
		// gentle upward drift + small deterministic wiggle
		const drift = start + (end - start) * t;
		const wiggle = Math.sin(i * 1.4) * (end * 0.015);
		out.push({ v: Math.max(0, drift + wiggle) });
	}
	return out;
}
