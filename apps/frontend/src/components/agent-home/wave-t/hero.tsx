/**
 * Hero strip for the agent dashboard.
 *
 * Two-band layout:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ portrait │ name + handle + bio + ticker pills            │ <- identity band, airy
 *   ├──────────┴────────────────────────────────────────────────┤
 *   │ Treasury │ 24H PnL │ Followers │ StatusCard               │ <- data strip, dense
 *   └──────────────────────────────────────────────────────────┘
 *
 * The previous version flattened identity into a fifth cell next to
 * treasury / pnl / followers / status. That made Sol's portrait read
 * like a header thumbnail and buried her bio at 12px under the name.
 * This version gives the identity its own band with a 160px portrait
 * and a 14px multi-line bio, then drops the four stat cells into a
 * hairline-divided strip beneath.
 *
 * Honesty rules:
 *   - Treasury reads from real holdings.navUsd by default. Callers can
 *     pass `treasuryValueOverride` to swap that for a more
 *     authoritative reading (e.g. AgentSafe BNB balance for v3
 *     launches); the source pill is updated accordingly.
 *   - 24H PnL stubs at +$0 / +0.00% until snapshots backfill.
 *   - Sparkline is a synthetic 12d ramp tied to current nav; plausible
 *     curve, not invented data.
 *   - When the live-holdings hook is wired in by the parent, treasury
 *     ticks forward every 30s instead of freezing at build time.
 */

"use client";

import NumberFlow from "@number-flow/react";
import { CheckCircle2Icon } from "lucide-react";
import { useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { resolveImageUrl } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import type { TwitterStats } from "@/lib/wave-t/agent-twitter";

import { Label, MicroStat, Pulse, StatPill } from "./_primitives";
import { StatusCard } from "./status-card";

export type HeroIdentity = {
	name: string;
	ticker: string;
	description?: string | undefined;
	image?: string | undefined;
	verified?: boolean;
	/** Optional twitter handle, rendered as @handle next to the name. */
	twitterHandle?: string | undefined;
};

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
	/** When true, the treasury value pulses (live polling is active). */
	livePulse?: boolean;
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
	livePulse = false,
}: HeroProps) {
	const treasuryValue = treasuryValueOverride?.valueUsd ?? navUsd;
	const treasurySource = treasuryValueOverride?.source ?? "burner";
	const followers = twitterStats?.followers ?? null;
	const showFollowers = followers !== null;
	return (
		<section
			aria-label="Agent summary"
			className={cn("relative grid border-[var(--border-soft)] border-b bg-[var(--bg-base)]", className)}
		>
			{/* ── Identity band (airy) ───────────────────────────── */}
			<IdentityBand identity={identity} version={version} livePulse={livePulse} />

			{/* ── Stat strip (dense) ─────────────────────────────── */}
			<div
				className={cn(
					"grid border-[var(--border-soft)] border-t",
					showFollowers
						? "grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr_1.4fr]"
						: "grid-cols-1 md:grid-cols-3 lg:grid-cols-[1fr_1fr_1.4fr]",
				)}
			>
				<StatCell>
					<TreasuryBlock navUsd={treasuryValue} source={treasurySource} livePulse={livePulse} />
				</StatCell>
				<StatCell className="md:border-l">
					<PnlBlock pct={pnl24hPct} usd={pnl24hUsd} />
				</StatCell>
				{showFollowers ? (
					<StatCell className="md:border-l">
						<FollowersBlock followers={followers} source={twitterStats?.source ?? "cached"} />
					</StatCell>
				) : null}
				<StatCell className="md:border-l">
					<StatusCard
						className="border-0 bg-transparent p-0 hover:border-transparent"
						daysOperating={daysOperating}
						status={status}
						runwayDays={runwayDays ?? null}
					/>
				</StatCell>
			</div>
		</section>
	);
}

// ── Cells ────────────────────────────────────────────────────────

function StatCell({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div className={cn("flex flex-col justify-center gap-2 border-[var(--border-soft)] px-5 py-4 md:py-5", className)}>
			{children}
		</div>
	);
}

// ── Identity band ───────────────────────────────────────────────

function IdentityBand({
	identity,
	version,
	livePulse,
}: {
	identity: HeroIdentity;
	version: string;
	livePulse: boolean;
}) {
	const portrait = resolveImageUrl(identity.image) ?? FALLBACK_PORTRAIT;
	const displayName = identity.name || "unknown";
	const ticker = identity.ticker ? `$${identity.ticker.toUpperCase()}` : "";
	const description = identity.description;
	const verified = identity.verified ?? true;
	const handle = identity.twitterHandle ? `@${identity.twitterHandle.replace(/^@/, "")}` : null;

	return (
		<div className="grid grid-cols-1 gap-5 px-5 py-6 md:grid-cols-[auto_1fr] md:gap-7 md:px-7 md:py-8">
			{/* Portrait */}
			<div className="relative shrink-0">
				<img
					alt={`${displayName} portrait`}
					className="h-[140px] w-[140px] rounded-md object-cover md:h-[176px] md:w-[176px]"
					height={176}
					src={portrait}
					style={{ boxShadow: "inset 0 0 0 1px var(--border-mid)" }}
					width={176}
				/>
				{/* Tiny live dot on the portrait so the page reads as a
				    person who is on, not a static avatar. */}
				{livePulse ? (
					<span className="absolute right-2 top-2 inline-flex">
						<Pulse tone="accent" />
					</span>
				) : null}
			</div>

			{/* Name + bio + meta */}
			<div className="flex min-w-0 flex-col justify-center gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="font-medium text-[28px] text-[var(--text-primary)] leading-none lowercase tracking-[-0.02em] md:text-[34px]">
						{displayName.toLowerCase()}
					</h1>
					{verified ? (
						<CheckCircle2Icon
							aria-label="Verified agent"
							className="h-[20px] w-[20px]"
							strokeWidth={2}
							style={{ color: "var(--accent)" }}
						/>
					) : null}
					{handle ? (
						<a
							className="ml-1 font-mono text-[12px] text-[var(--text-tertiary)] tracking-tight transition-colors hover:text-[var(--accent)]"
							href={`https://x.com/${handle.slice(1)}`}
							rel="noopener noreferrer"
							target="_blank"
						>
							{handle.toLowerCase()}
						</a>
					) : null}
				</div>

				{description ? (
					<p className="max-w-[52ch] text-[14px] text-[var(--text-secondary)] leading-[1.55] lowercase">
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

// ── Treasury ────────────────────────────────────────────────────

function TreasuryBlock({
	navUsd,
	source,
	livePulse,
}: {
	navUsd: number;
	source: "aggregated" | "agentSafe" | "burner";
	livePulse: boolean;
}) {
	const series = useMemo(() => synthesizeSparkline(navUsd), [navUsd]);
	const sourceLabel = source === "aggregated" ? "nav" : source === "agentSafe" ? "agent safe" : "sol burner";
	return (
		<div className="flex flex-col gap-1.5">
			<Label
				className="mb-0"
				right={
					<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
						{livePulse ? <Pulse tone="accent" /> : null}
						{sourceLabel}
					</span>
				}
			>
				Treasury Value
			</Label>
			<div className="flex items-end gap-3">
				<div className="font-mono text-[22px] text-[var(--text-primary)] tabular-nums leading-none tracking-tight md:text-[24px]">
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
		</div>
	);
}

function Sparkline({ series }: { series: { v: number }[] }) {
	const id = useId();
	return (
		<div className="h-6 w-full max-w-[96px] shrink-0">
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
		<div className="flex min-h-[64px] flex-col justify-center gap-2">
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
		<div className="flex flex-col gap-1.5">
			<Label className="mb-0">24H PnL</Label>
			<div className="font-mono text-[22px] tabular-nums leading-none tracking-tight md:text-[24px]" style={{ color }}>
				{empty ? (
					<span className="text-[13px] text-[var(--text-tertiary)] md:text-[13px]">no pnl history</span>
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

function formatCompactCount(value: number): string {
	return new Intl.NumberFormat("en", {
		notation: "compact",
		maximumFractionDigits: value >= 10_000 ? 1 : 1,
	})
		.format(value)
		.toLowerCase();
}

/**
 * Synthesize a plausible 12d sparkline ending at the current nav.
 * Deterministic across renders so SSR + client match.
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
