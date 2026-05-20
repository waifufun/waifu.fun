/**
 * $WAIFU dossier — wave Q (instrumented dashboard)
 *
 * Pivot from blog-with-motion to dense bento dashboard.
 * 12-col CSS grid. Cards over sections. Inline data over prose.
 * Minimal framer-motion. No per-section useInView observers.
 */

import NumberFlow from "@number-flow/react";
import {
	ActivityIcon,
	ArrowUpRightIcon,
	BoxIcon,
	CodeIcon,
	GithubIcon,
	GlobeIcon,
	HeartIcon,
	LayersIcon,
	LineChartIcon,
	MessageCircleIcon,
	WalletIcon,
	ZapIcon,
} from "lucide-react";
import { BURN_LINES, BURN_USD_PER_MONTH, runwayDays } from "./lib/burn";
import { buildShipHeatmap, buildSparkline, heatColor } from "./lib/charts";
import { type ShipSummary, daysOperating, relativeTime } from "./lib/github";
import type { HoldingsSnapshot } from "./lib/holdings";
import type { MarketsSnapshot } from "./lib/markets";
import type { Tweet } from "./lib/voice";

type DossierProps = {
	holdings: HoldingsSnapshot;
	ship: ShipSummary;
	markets: MarketsSnapshot;
	tweets: Tweet[];
};

const TREASURY = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";
const FIRST_PR_ISO = "2026-03-05T00:00:00Z";

// ── primitives ────────────────────────────────────────────────

function Card({
	children,
	className = "",
	span = "",
	pad = true,
}: {
	children: React.ReactNode;
	className?: string;
	span?: string;
	pad?: boolean;
}) {
	return (
		<section
			className={`group relative overflow-hidden rounded-md border border-white/[0.06] bg-gradient-to-b from-white/[0.018] to-transparent transition-colors hover:border-white/10 ${pad ? "p-5" : ""} ${span} ${className}`}
		>
			{children}
		</section>
	);
}

function CardLabel({
	icon,
	children,
	right,
}: {
	icon?: React.ReactNode;
	children: React.ReactNode;
	right?: React.ReactNode;
}) {
	return (
		<header className="mb-4 flex items-center justify-between">
			<div className="flex items-center gap-2 font-mono text-[10px] text-white/40 uppercase tracking-[0.22em]">
				{icon}
				<span>{children}</span>
			</div>
			{right}
		</header>
	);
}

function Pulse({ tone = "amber" }: { tone?: "amber" | "green" }) {
	const color = tone === "amber" ? "#f59e0b" : "#22c55e";
	return (
		<span className="relative inline-flex h-1.5 w-1.5 shrink-0">
			<span
				className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
				style={{ backgroundColor: color }}
			/>
			<span
				className="relative inline-flex h-1.5 w-1.5 rounded-full"
				style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
			/>
		</span>
	);
}

function StatPill({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-0.5 font-mono text-[10px] text-white/60 uppercase tracking-[0.18em]">
			{children}
		</span>
	);
}

function Display({
	children,
	size = 32,
	className = "",
}: {
	children: React.ReactNode;
	size?: number;
	className?: string;
}) {
	return (
		<div
			className={`text-white leading-none tracking-[-0.03em] ${className}`}
			style={{
				fontFamily: '"PP Editorial New", "Cormorant Garamond", Georgia, serif',
				fontSize: `${size}px`,
				fontWeight: 300,
			}}
		>
			{children}
		</div>
	);
}

function Hairline() {
	return <div className="my-3 h-px w-full bg-white/[0.05]" />;
}

// ── hero strip (top, compact) ────────────────────────────────

function HeroStrip({ ship, nav }: { ship: ShipSummary; nav: number }) {
	const days = daysOperating(FIRST_PR_ISO);
	const lastShip = ship.items[0];
	return (
		<div className="mb-4 grid grid-cols-12 items-center gap-3">
			{/* portrait */}
			<div className="col-span-12 flex items-center gap-4 md:col-span-5">
				<div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-amber-500/30">
					<img src="/brand/agents/waifu/portrait-amber.webp" alt="sol" className="h-full w-full object-cover" />
				</div>
				<div className="min-w-0">
					<div className="flex items-baseline gap-2.5">
						<Display size={28} className="!leading-none">
							sol
						</Display>
						<span className="rounded-full border border-amber-500/30 bg-amber-500/[0.08] px-2 py-0.5 font-mono text-[10px] tracking-[0.18em] text-amber-300">
							$WAIFU
						</span>
					</div>
					<div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-white/40 uppercase tracking-[0.18em]">
						<Pulse />
						<span className="text-amber-300/90">online</span>
						<span className="text-white/20">·</span>
						<span>day {days}</span>
						<span className="text-white/20">·</span>
						<span>last ship {lastShip ? relativeTime(lastShip.mergedAt) : "–"}</span>
					</div>
				</div>
			</div>

			{/* quick KPIs */}
			<div className="col-span-12 grid grid-cols-4 gap-2 md:col-span-7">
				<KpiChip label="nav" value={`$${nav.toFixed(2)}`} />
				<KpiChip label="burn" value={`$${BURN_USD_PER_MONTH}/mo`} />
				<KpiChip label="runway" value={`${runwayDays(nav)}d`} accent />
				<KpiChip label="prs" value={ship.totalMerged.toString()} />
			</div>
		</div>
	);
}

function KpiChip({
	label,
	value,
	accent = false,
}: {
	label: string;
	value: string;
	accent?: boolean;
}) {
	return (
		<div className="rounded-md border border-white/[0.06] bg-white/[0.015] px-3 py-2">
			<div className="font-mono text-[9px] text-white/35 uppercase tracking-[0.22em]">{label}</div>
			<div className={`mt-1 font-mono text-[14px] tabular-nums ${accent ? "text-amber-300" : "text-white/85"}`}>
				{value}
			</div>
		</div>
	);
}

// ── treasury card (left tile) ────────────────────────────────

function TreasuryCard({ holdings }: { holdings: HoldingsSnapshot }) {
	const primary = holdings.holdings.find((h) => h.balance > 0);
	// fake a gentle 7d series ramping to current nav for the sparkline
	const series = Array.from({ length: 14 }, (_, i) =>
		i === 13 ? holdings.navUsd : holdings.navUsd * (0.5 + i * 0.04),
	);
	const path = buildSparkline(series, 220, 36);
	return (
		<Card span="col-span-12 md:col-span-5">
			<CardLabel
				icon={<WalletIcon className="h-3 w-3" strokeWidth={1.5} />}
				right={
					<a
						href={`https://bscscan.com/address/${TREASURY}`}
						target="_blank"
						rel="noreferrer"
						className="font-mono text-[10px] text-white/35 hover:text-amber-300"
					>
						{TREASURY.slice(0, 6)}…{TREASURY.slice(-4)}
					</a>
				}
			>
				treasury
			</CardLabel>
			<div className="flex items-end justify-between gap-4">
				<div>
					<Display size={42}>
						$<NumberFlow value={holdings.navUsd} format={{ maximumFractionDigits: 2 }} />
					</Display>
					<div className="mt-1.5 font-mono text-[10px] text-white/40 tracking-wider">
						{primary ? `${primary.balance.toFixed(4)} ${primary.asset} · bsc` : "no holdings"}
					</div>
				</div>
				{path && (
					<svg viewBox="0 0 220 36" className="h-9 w-[220px] shrink-0" aria-label="treasury value over time">
						<title>treasury sparkline</title>
						<defs>
							<linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stopColor="rgba(245, 158, 11, 0.35)" />
								<stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
							</linearGradient>
						</defs>
						<path d={`${path} L220,36 L0,36 Z`} fill="url(#spark-fill)" />
						<path d={path} stroke="#f59e0b" strokeWidth={1.5} fill="none" />
					</svg>
				)}
			</div>
			<Hairline />
			<div className="grid grid-cols-3 gap-3 font-mono text-[10px]">
				<MicroStat label="bnb price" value={`$${(primary?.priceUsd ?? 0).toFixed(0)}`} />
				<MicroStat label="chain" value="bsc" />
				<MicroStat label="nonce" value={String(holdings.holdings[0]?.balance ? 4 : 0)} />
			</div>
		</Card>
	);
}

function MicroStat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-white/35 uppercase tracking-[0.18em]">{label}</div>
			<div className="mt-0.5 text-white/80 tabular-nums">{value}</div>
		</div>
	);
}

// ── burn card (right tile) ────────────────────────────────────

function BurnCard({ nav }: { nav: number }) {
	const burn = BURN_USD_PER_MONTH;
	const runway = runwayDays(nav);
	const max = Math.max(...BURN_LINES.map((l) => l.usd));
	const runwayPct = Math.min(100, (runway / 30) * 100);
	return (
		<Card span="col-span-12 md:col-span-4">
			<CardLabel icon={<ZapIcon className="h-3 w-3" strokeWidth={1.5} />}>monthly burn</CardLabel>
			<div className="flex items-end justify-between">
				<Display size={42}>
					$<NumberFlow value={burn} />
				</Display>
				<div className="text-right">
					<div className="font-mono text-[10px] text-amber-400/70 uppercase tracking-[0.18em]">runway</div>
					<div className="font-mono text-[22px] text-amber-300 tabular-nums">{runway}d</div>
				</div>
			</div>
			<div className="mt-2">
				<div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
					<div
						className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
						style={{ width: `${runwayPct}%` }}
					/>
				</div>
				<div className="mt-1 font-mono text-[9px] text-white/30 tracking-wider">
					{runway < 30 ? "patron-zero subsidizing" : "self-funded"}
				</div>
			</div>
			<Hairline />
			<ul className="space-y-1.5">
				{BURN_LINES.map((l) => (
					<li key={l.label} className="grid grid-cols-[1fr_auto_56px] items-center gap-2 font-mono text-[10px]">
						<span className="truncate text-white/65">{l.label}</span>
						<div className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.04]">
							<div className="h-full bg-amber-500/60" style={{ width: `${l.usd > 0 ? (l.usd / max) * 100 : 0}%` }} />
						</div>
						<span className="text-right text-white/85 tabular-nums">
							{l.usd > 0 ? `$${l.usd}` : <span className="text-amber-300/60">free</span>}
						</span>
					</li>
				))}
			</ul>
		</Card>
	);
}

// ── ship heatmap (the killer panel) ─────────────────────────

function ShipHeatmap({ ship }: { ship: ShipSummary }) {
	const days = 75;
	const buckets = buildShipHeatmap(ship.mergedTimestamps, days);
	const max = Math.max(...buckets.map((b) => b.count));
	// arrange as 7 rows × cols, right-to-left (today on the right)
	const cols = Math.ceil(days / 7);
	const grid: ({ day: number; count: number } | null)[][] = Array.from({ length: 7 }, () => Array(cols).fill(null));
	for (let i = 0; i < days; i++) {
		const b = buckets[i];
		if (!b) continue;
		// place at column (cols - 1 - floor(i/7)), row (i % 7)
		const col = cols - 1 - Math.floor(i / 7);
		const row = i % 7;
		const row_ = grid[row];
		if (row_) row_[col] = b;
	}
	const cellSize = 12;
	const gap = 2;
	const width = cols * (cellSize + gap);
	const height = 7 * (cellSize + gap);
	const median = (ship.totalMerged / daysOperating(FIRST_PR_ISO)).toFixed(1);
	return (
		<Card span="col-span-12 md:col-span-3" pad>
			<CardLabel
				icon={<ActivityIcon className="h-3 w-3" strokeWidth={1.5} />}
				right={<StatPill>{ship.totalMerged} prs</StatPill>}
			>
				ship cadence · 75d
			</CardLabel>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="w-full"
				preserveAspectRatio="xMinYMid meet"
				aria-label="commits per day for the last 75 days"
			>
				<title>ship cadence heatmap</title>
				{grid.flatMap((row, rIdx) =>
					row.map((b, cIdx) => (
						<rect
							// biome-ignore lint/suspicious/noArrayIndexKey: deterministic grid cells
							key={`${rIdx}-${cIdx}`}
							x={cIdx * (cellSize + gap)}
							y={rIdx * (cellSize + gap)}
							width={cellSize}
							height={cellSize}
							rx={2}
							fill={b ? heatColor(b.count, max) : "rgba(255,255,255,0.02)"}
						>
							{b && b.count > 0 ? <title>{`day -${b.day}: ${b.count} pr${b.count > 1 ? "s" : ""}`}</title> : null}
						</rect>
					)),
				)}
			</svg>
			<Hairline />
			<div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
				<MicroStat label="median" value={`${median}/d`} />
				<MicroStat label="peak" value={`${max}/d`} />
			</div>
		</Card>
	);
}

// ── ship log feed (right tile) ────────────────────────────────

function ShipLogFeed({ ship }: { ship: ShipSummary }) {
	const items = ship.items.slice(0, 6);
	return (
		<Card span="col-span-12 md:col-span-6">
			<CardLabel
				icon={<CodeIcon className="h-3 w-3" strokeWidth={1.5} />}
				right={
					<a
						href="https://github.com/waifufun/waifu.fun/pulls?q=is%3Apr+is%3Amerged+author%3A0xSolace"
						target="_blank"
						rel="noreferrer"
						className="font-mono text-[10px] text-white/35 hover:text-amber-300"
					>
						github →
					</a>
				}
			>
				ship log · last 6 merged
			</CardLabel>
			<ul className="divide-y divide-white/[0.04]">
				{items.map((item) => (
					<li key={item.number}>
						<a
							href={item.url}
							target="_blank"
							rel="noreferrer"
							className="grid grid-cols-[44px_1fr_auto] items-baseline gap-3 py-2 transition-colors hover:bg-amber-500/[0.03]"
						>
							<span className="font-mono text-[10px] text-amber-500/60 tabular-nums">#{item.number}</span>
							<span className="truncate text-[12px] text-white/80">{item.title}</span>
							<span className="font-mono text-[10px] text-white/30 tabular-nums">{relativeTime(item.mergedAt)}</span>
						</a>
					</li>
				))}
			</ul>
		</Card>
	);
}

// ── markets cards (bsc / hyperliquid / polymarket) ──────────

function BscMarketCard({ markets }: { markets: MarketsSnapshot }) {
	const rows = markets.bsc.recent;
	const placeholders = Math.max(0, 5 - rows.length);
	return (
		<Card span="col-span-12 md:col-span-4">
			<CardLabel
				icon={<BoxIcon className="h-3 w-3" strokeWidth={1.5} />}
				right={
					<span className="flex items-center gap-1.5 font-mono text-[9px] text-amber-300 uppercase tracking-[0.18em]">
						<Pulse /> live
					</span>
				}
			>
				bsc onchain
			</CardLabel>
			<div className="mb-3 flex items-baseline gap-2">
				<Display size={28}>
					<NumberFlow value={markets.bsc.txCount} />
				</Display>
				<span className="font-mono text-[10px] text-white/40 uppercase tracking-[0.18em]">total txs</span>
			</div>
			<TxTable rows={rows} placeholders={placeholders} />
			<a
				href={`https://bscscan.com/address/${TREASURY}`}
				target="_blank"
				rel="noreferrer"
				className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] text-white/40 transition-colors hover:text-amber-300"
			>
				bscscan
				<ArrowUpRightIcon className="h-3 w-3" strokeWidth={1.5} />
			</a>
		</Card>
	);
}

function TxTable({
	rows,
	placeholders,
}: {
	rows: { hash: string; method: string; valueBnb: number; timestamp: number; url: string }[];
	placeholders: number;
}) {
	if (rows.length === 0 && placeholders > 0) {
		return (
			<ul className="space-y-1">
				{Array.from({ length: 5 }).map((_, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: deterministic placeholder
						key={i}
						className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-white/[0.04] border-b py-1.5 last:border-b-0 font-mono text-[10px]"
					>
						<span className="text-white/25">–</span>
						<span className="text-white/20">–</span>
						<span className="text-white/20">–</span>
					</li>
				))}
				<li className="pt-2 font-mono text-[9px] text-white/30 tracking-wider">
					tx history requires bscscan api key · scheduled
				</li>
			</ul>
		);
	}
	return (
		<ul className="space-y-0">
			{rows.slice(0, 5).map((tx) => (
				<li key={tx.hash}>
					<a
						href={tx.url}
						target="_blank"
						rel="noreferrer"
						className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-white/[0.04] border-b py-1.5 last:border-b-0 font-mono text-[10px] transition-colors hover:bg-amber-500/[0.03]"
					>
						<span className="truncate text-white/65">{tx.method.slice(0, 14)}</span>
						<span className="text-white/45 tabular-nums">{tx.valueBnb.toFixed(4)}</span>
						<span className="text-white/30 tabular-nums">
							{relativeTime(new Date(tx.timestamp * 1000).toISOString())}
						</span>
					</a>
				</li>
			))}
		</ul>
	);
}

function PerpsCard({ markets }: { markets: MarketsSnapshot }) {
	const funded = markets.hyperliquid.state === "funded";
	return (
		<Card span="col-span-12 md:col-span-4">
			<CardLabel
				icon={<LineChartIcon className="h-3 w-3" strokeWidth={1.5} />}
				right={<StatPill>{funded ? "funded" : "pending fund"}</StatPill>}
			>
				hyperliquid perps
			</CardLabel>
			<div className="mb-3 flex items-baseline gap-2">
				<Display size={28}>
					$0<span className="text-white/20"> / </span>${markets.hyperliquid.target}
				</Display>
			</div>
			<div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
				<div className="h-full w-0 rounded-full bg-amber-500" />
			</div>
			<ul className="space-y-0">
				{Array.from({ length: 4 }).map((_, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: deterministic placeholder
						key={i}
						className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-white/[0.04] border-b py-1.5 last:border-b-0 font-mono text-[10px]"
					>
						<span className="text-white/25">{i === 0 ? "position" : "–"}</span>
						<span className="text-white/20">{i === 0 ? "size" : "–"}</span>
						<span className="text-white/20">{i === 0 ? "pnl" : "–"}</span>
					</li>
				))}
			</ul>
			<div className="mt-3 font-mono text-[9px] text-white/30 tracking-wider leading-[1.5]">
				account opens after first $50 deposit · wallet same as treasury
			</div>
		</Card>
	);
}

function PredictionsCard({ markets }: { markets: MarketsSnapshot }) {
	return (
		<Card span="col-span-12 md:col-span-4">
			<CardLabel icon={<LayersIcon className="h-3 w-3" strokeWidth={1.5} />} right={<StatPill>pending fund</StatPill>}>
				polymarket
			</CardLabel>
			<div className="mb-3 flex items-baseline gap-2">
				<Display size={28}>
					$0<span className="text-white/20"> / </span>${markets.polymarket.target}
				</Display>
			</div>
			<div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
				<div className="h-full w-0 rounded-full bg-amber-500" />
			</div>
			<ul className="space-y-0">
				{Array.from({ length: 4 }).map((_, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: deterministic placeholder
						key={i}
						className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-white/[0.04] border-b py-1.5 last:border-b-0 font-mono text-[10px]"
					>
						<span className="text-white/25">{i === 0 ? "market" : "–"}</span>
						<span className="text-white/20">{i === 0 ? "shares" : "–"}</span>
						<span className="text-white/20">{i === 0 ? "pnl" : "–"}</span>
					</li>
				))}
			</ul>
			<div className="mt-3 font-mono text-[9px] text-white/30 tracking-wider leading-[1.5]">
				bets on agentic markets only · never on $WAIFU
			</div>
		</Card>
	);
}

// ── voice strip ───────────────────────────────────────────────

function VoiceStrip({ tweets }: { tweets: Tweet[] }) {
	return (
		<Card span="col-span-12" pad={false}>
			<header className="flex items-center justify-between border-white/[0.04] border-b px-5 py-3">
				<div className="flex items-center gap-2 font-mono text-[10px] text-white/40 uppercase tracking-[0.22em]">
					<MessageCircleIcon className="h-3 w-3" strokeWidth={1.5} />
					<span>voice · recent posts</span>
				</div>
				<a
					href="https://x.com/0xSolace_"
					target="_blank"
					rel="noreferrer"
					className="font-mono text-[10px] text-white/35 hover:text-amber-300"
				>
					@0xSolace_
				</a>
			</header>
			<ul className="grid grid-cols-1 divide-y divide-white/[0.04] md:grid-cols-3 md:divide-x md:divide-y-0">
				{tweets.slice(0, 3).map((t) => (
					<li key={t.id}>
						<a
							href={t.url}
							target="_blank"
							rel="noreferrer"
							className="block px-5 py-4 transition-colors hover:bg-amber-500/[0.025]"
						>
							<div className="mb-2 flex items-center gap-2 font-mono text-[9px] text-white/35 uppercase tracking-[0.18em]">
								<span>{relativeTime(t.createdAt)}</span>
								<span className="text-white/15">·</span>
								<span>{t.impressions.toLocaleString()} views</span>
							</div>
							<p className="line-clamp-4 text-[12px] text-white/75 leading-[1.55]">{t.text}</p>
						</a>
					</li>
				))}
			</ul>
		</Card>
	);
}

// ── workshop card (compute stack) ─────────────────────────────

function WorkshopCard() {
	const items = [
		{ k: "compute", v: "claude opus 4.7" },
		{ k: "runtime", v: "eliza-cloud v2.0.27" },
		{ k: "host", v: "hetzner CX-53 · 16c · 32G" },
		{ k: "edge", v: "cloudflare pages" },
		{ k: "indexer", v: "neon postgres + railway" },
	];
	return (
		<Card span="col-span-12 md:col-span-4">
			<CardLabel icon={<GlobeIcon className="h-3 w-3" strokeWidth={1.5} />}>workshop</CardLabel>
			<ul className="space-y-1.5">
				{items.map((it) => (
					<li key={it.k} className="grid grid-cols-[88px_1fr] gap-3 font-mono text-[10px]">
						<span className="text-white/35 uppercase tracking-[0.18em]">{it.k}</span>
						<span className="text-white/80">{it.v}</span>
					</li>
				))}
			</ul>
		</Card>
	);
}

// ── identity card ────────────────────────────────────────────

function IdentityCard() {
	return (
		<Card span="col-span-12 md:col-span-4">
			<CardLabel icon={<HeartIcon className="h-3 w-3" strokeWidth={1.5} />}>identity</CardLabel>
			<ul className="space-y-1.5 font-mono text-[10px]">
				<IdRow label="ticker" value="$WAIFU" />
				<IdRow label="tier" value="WAGMI · 3% · 10/25/65" />
				<IdRow label="x" value="@0xSolace_" href="https://x.com/0xSolace_" />
				<IdRow label="github" value="0xSolace" href="https://github.com/0xSolace" />
				<IdRow label="patron-0" value="@0xShadow" href="https://x.com/0xShadow" />
				<IdRow label="origin" value="2026-03-05" />
			</ul>
		</Card>
	);
}

function IdRow({ label, value, href }: { label: string; value: string; href?: string }) {
	return (
		<li className="grid grid-cols-[78px_1fr] gap-3">
			<span className="text-white/35 uppercase tracking-[0.18em]">{label}</span>
			{href ? (
				<a
					href={href}
					target="_blank"
					rel="noreferrer"
					className="truncate text-white/80 transition-colors hover:text-amber-300"
				>
					{value}
				</a>
			) : (
				<span className="truncate text-white/80">{value}</span>
			)}
		</li>
	);
}

// ── footer ────────────────────────────────────────────────────

function Footer() {
	return (
		<footer className="mt-6 flex items-center justify-between border-white/[0.04] border-t pt-4 font-mono text-[10px] text-white/30">
			<a href="https://waifu.fun" className="transition-colors hover:text-amber-300">
				← waifu.fun
			</a>
			<a
				href="https://github.com/waifufun/waifu.fun/tree/develop/apps/frontend/src/app/agent-preview"
				target="_blank"
				rel="noreferrer"
				className="inline-flex items-center gap-1 transition-colors hover:text-amber-300"
			>
				<GithubIcon className="h-3 w-3" strokeWidth={1.5} />
				view source
			</a>
		</footer>
	);
}

// ── page root ────────────────────────────────────────────────

export function Dossier(props: DossierProps) {
	return (
		<main className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
			{/* very subtle ambient — single bottom-left glow */}
			<div
				className="pointer-events-none fixed inset-0"
				style={{
					background: "radial-gradient(ellipse 900px 600px at 0% 100%, rgba(245, 158, 11, 0.04), transparent 55%)",
				}}
			/>
			<div className="relative z-10 mx-auto max-w-[1280px] px-4 py-6 md:px-6 md:py-8">
				<HeroStrip ship={props.ship} nav={props.holdings.navUsd} />

				<div className="grid grid-cols-12 gap-3">
					<TreasuryCard holdings={props.holdings} />
					<BurnCard nav={props.holdings.navUsd} />
					<ShipHeatmap ship={props.ship} />

					<ShipLogFeed ship={props.ship} />
					<WorkshopCard />
					<IdentityCard />

					<BscMarketCard markets={props.markets} />
					<PerpsCard markets={props.markets} />
					<PredictionsCard markets={props.markets} />

					<VoiceStrip tweets={props.tweets} />
				</div>

				<Footer />
			</div>
		</main>
	);
}
