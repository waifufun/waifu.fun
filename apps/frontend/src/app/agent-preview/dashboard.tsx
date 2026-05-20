"use client";

/**
 * $WAIFU dashboard — wave R (chart-centric, sophisticated/modern)
 *
 * Shape:
 *   1. HeroBar       — compact portrait + name + status + buy
 *   2. RevenueChart  — DOMINANT stacked area, 4 streams, time tabs
 *   3. ActivityFeed  — unified PR + tweet + tx + revenue stream
 *   4. StatsRail     — 6 KPIs + stack mini + link to /trading
 *
 * Type: trading-terminal feel, no editorial serif, restrained amber,
 * Geist mono throughout. Inspired by defillama/dune/linear/mercury.
 */

import {
	ActivityIcon,
	ArrowRightIcon,
	ArrowUpRightIcon,
	BoxIcon,
	GitPullRequestIcon,
	GlobeIcon,
	LineChartIcon,
	type LucideIcon,
	SparklesIcon,
	WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ActivityItem } from "./lib/activity";
import { BURN_USD_PER_MONTH, runwayDays } from "./lib/burn";
import { type ShipSummary, daysOperating, relativeTime } from "./lib/github";
import type { HoldingsSnapshot } from "./lib/holdings";
import { type RevenueRange, STREAMS, loadRevenue } from "./lib/revenue";

type DashboardProps = {
	holdings: HoldingsSnapshot;
	ship: ShipSummary;
	activity: ActivityItem[];
};

const TREASURY = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";
const FIRST_PR_ISO = "2026-03-05T00:00:00Z";

// ── shared atoms ────────────────────────────────────────────────

function Panel({
	children,
	className = "",
	noPad = false,
}: {
	children: React.ReactNode;
	className?: string;
	noPad?: boolean;
}) {
	return (
		<section
			className={`relative overflow-hidden rounded-md border border-white/[0.06] bg-[#0b0b0e] ${noPad ? "" : "p-5"} ${className}`}
		>
			{children}
		</section>
	);
}

function Label({
	icon: Icon,
	children,
	right,
}: {
	icon?: LucideIcon;
	children: React.ReactNode;
	right?: React.ReactNode;
}) {
	return (
		<header className="mb-4 flex items-center justify-between">
			<div className="flex items-center gap-2 font-mono text-[10px] text-white/45 uppercase tracking-[0.2em]">
				{Icon && <Icon className="h-3 w-3" strokeWidth={1.5} />}
				<span>{children}</span>
			</div>
			{right}
		</header>
	);
}

function Pulse() {
	return (
		<span className="relative inline-flex h-1.5 w-1.5 shrink-0">
			<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
			<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
		</span>
	);
}

// ── hero bar ───────────────────────────────────────────────────

function HeroBar({ ship }: { ship: ShipSummary }) {
	const days = daysOperating(FIRST_PR_ISO);
	const lastShip = ship.items[0];
	return (
		<header className="mb-3 flex items-center justify-between gap-4 rounded-md border border-white/[0.06] bg-[#0b0b0e] px-4 py-3">
			<div className="flex items-center gap-3 min-w-0">
				<div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-sm ring-1 ring-amber-500/25">
					<img src="/brand/agents/waifu/portrait-amber.webp" alt="sol" className="h-full w-full object-cover" />
				</div>
				<div className="min-w-0">
					<div className="flex items-baseline gap-2">
						<span className="font-mono text-[15px] font-medium text-white tracking-tight">sol</span>
						<span className="font-mono text-[11px] tracking-[0.16em] text-amber-300/90">$WAIFU</span>
					</div>
					<div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-white/45 uppercase tracking-[0.16em]">
						<Pulse />
						<span className="text-amber-300/80">online</span>
						<span className="text-white/20">·</span>
						<span>day {days}</span>
						<span className="text-white/20">·</span>
						<span>last ship {lastShip ? relativeTime(lastShip.mergedAt) : "–"}</span>
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<a
					href={`https://bscscan.com/address/${TREASURY}`}
					target="_blank"
					rel="noreferrer"
					className="hidden font-mono text-[10px] text-white/45 uppercase tracking-[0.18em] transition-colors hover:text-amber-300 sm:inline"
				>
					{TREASURY.slice(0, 6)}…{TREASURY.slice(-4)}
				</a>
				<a
					href={`https://four.meme/token/${TREASURY}`}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 rounded-sm bg-amber-400 px-3 py-1.5 font-mono text-[11px] text-black tracking-[0.16em] uppercase transition-transform hover:scale-[1.02]"
				>
					buy <ArrowUpRightIcon className="h-3 w-3" strokeWidth={2.5} />
				</a>
			</div>
		</header>
	);
}

// ── revenue chart ──────────────────────────────────────────────

function RevenueChartPanel() {
	const [range, setRange] = useState<RevenueRange>("30d");
	const snapshot = useMemo(() => loadRevenue(range), [range]);
	// recharts data needs `t` as a number for ordinal axis, store as ms
	const data = useMemo(
		() =>
			snapshot.points.map((p) => ({
				t: new Date(p.t).getTime(),
				tax: p.tax,
				referral: p.referral,
				skill: p.skill,
				trading: p.trading,
			})),
		[snapshot],
	);

	return (
		<Panel className="col-span-12">
			<Label
				icon={LineChartIcon}
				right={
					<div className="flex gap-1">
						{(["24h", "7d", "30d", "all"] as RevenueRange[]).map((r) => (
							<button
								type="button"
								key={r}
								onClick={() => setRange(r)}
								className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
									range === r ? "bg-amber-400/15 text-amber-200" : "text-white/40 hover:text-white/70"
								}`}
							>
								{r}
							</button>
						))}
					</div>
				}
			>
				revenue
			</Label>

			<div className="mb-4 flex items-baseline gap-3">
				<div className="font-mono text-[40px] font-light text-white tabular-nums tracking-tight">
					${snapshot.grandTotalUsd.toFixed(2)}
				</div>
				<div className="font-mono text-[10px] text-white/35 uppercase tracking-[0.18em]">
					{range} · all streams scheduled
				</div>
			</div>

			<div className="h-[260px] w-full">
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
						<defs>
							{STREAMS.map((s) => (
								<linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
									<stop offset="100%" stopColor={s.color} stopOpacity={0} />
								</linearGradient>
							))}
						</defs>
						<CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="0" vertical={false} />
						<XAxis
							dataKey="t"
							type="number"
							scale="time"
							domain={["dataMin", "dataMax"]}
							tickFormatter={(v) => formatTick(v, range)}
							stroke="rgba(255,255,255,0.18)"
							tick={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: 10, fill: "rgba(255,255,255,0.35)" }}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis
							stroke="rgba(255,255,255,0.18)"
							tick={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
							tickFormatter={(v) => `$${v}`}
							axisLine={false}
							tickLine={false}
							width={44}
							domain={[0, "auto"]}
						/>
						<Tooltip
							contentStyle={{
								background: "#0b0b0e",
								border: "1px solid rgba(255,255,255,0.08)",
								borderRadius: 4,
								fontSize: 11,
								fontFamily: "var(--font-geist-mono, monospace)",
							}}
							labelFormatter={(v) => new Date(v as number).toISOString().slice(0, 16).replace("T", " ")}
							formatter={(v, name) => [`$${Number(v ?? 0).toFixed(2)}`, String(name)]}
						/>
						{STREAMS.map((s) => (
							<Area
								key={s.key}
								type="monotone"
								dataKey={s.key}
								stackId="rev"
								stroke={s.color}
								strokeWidth={1.25}
								fill={`url(#grad-${s.key})`}
							/>
						))}
					</AreaChart>
				</ResponsiveContainer>
			</div>

			<div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
				{STREAMS.map((s) => (
					<div
						key={s.key}
						className="flex items-start gap-2 rounded-sm border border-white/[0.05] bg-white/[0.012] px-3 py-2"
					>
						<span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
						<div className="min-w-0">
							<div className="font-mono text-[10px] text-white/55 uppercase tracking-[0.18em]">{s.label}</div>
							<div className="mt-0.5 font-mono text-[12px] text-white/85 tabular-nums">
								${snapshot.totalsUsd[s.key].toFixed(2)}
							</div>
							<div className="font-mono text-[9px] text-white/30 leading-snug">{s.note}</div>
						</div>
					</div>
				))}
			</div>
		</Panel>
	);
}

function formatTick(v: number, range: RevenueRange): string {
	const d = new Date(v);
	if (range === "24h") return `${d.getUTCHours().toString().padStart(2, "0")}:00`;
	if (range === "7d" || range === "30d") return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
	return `${d.getUTCMonth() + 1}/${d.getUTCDate().toString().padStart(2, "0")}`;
}

// ── activity feed ──────────────────────────────────────────────

const ACTIVITY_META: Record<ActivityItem["type"], { icon: LucideIcon; label: string; color: string }> = {
	pr: { icon: GitPullRequestIcon, label: "ship", color: "#22c55e" },
	tweet: { icon: SparklesIcon, label: "voice", color: "#60a5fa" },
	tx: { icon: BoxIcon, label: "onchain", color: "#f59e0b" },
	revenue: { icon: WalletIcon, label: "revenue", color: "#fbbf24" },
};

function ActivityFeed({ items }: { items: ActivityItem[] }) {
	const [visible, setVisible] = useState(8);
	return (
		<Panel className="col-span-12 md:col-span-8">
			<Label
				icon={ActivityIcon}
				right={
					<a
						href="https://github.com/waifufun/waifu.fun/pulls?q=is%3Apr+is%3Amerged+author%3A0xSolace"
						target="_blank"
						rel="noreferrer"
						className="font-mono text-[10px] text-white/40 uppercase tracking-[0.18em] transition-colors hover:text-amber-300"
					>
						github →
					</a>
				}
			>
				activity · {items.length} events
			</Label>
			<ul className="divide-y divide-white/[0.04]">
				{items.slice(0, visible).map((it) => (
					<ActivityRow key={it.id} item={it} />
				))}
			</ul>
			{visible < items.length && (
				<button
					type="button"
					onClick={() => setVisible((v) => v + 8)}
					className="mt-4 w-full rounded-sm border border-white/[0.05] py-2 font-mono text-[10px] text-white/45 uppercase tracking-[0.2em] transition-colors hover:border-amber-500/20 hover:text-amber-300"
				>
					load more · {items.length - visible} remaining
				</button>
			)}
		</Panel>
	);
}

function ActivityRow({ item }: { item: ActivityItem }) {
	const meta = ACTIVITY_META[item.type];
	const Icon = meta.icon;
	return (
		<li>
			<a
				href={item.type === "revenue" ? "#" : (item.url as string)}
				target={item.type === "revenue" ? undefined : "_blank"}
				rel="noreferrer"
				className="grid grid-cols-[28px_1fr_auto] items-start gap-3 py-3 transition-colors hover:bg-white/[0.015]"
			>
				<span
					className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-sm"
					style={{
						backgroundColor: `${meta.color}22`,
						color: meta.color,
					}}
				>
					<Icon className="h-3 w-3" strokeWidth={2} />
				</span>
				<div className="min-w-0">
					<div className="flex items-baseline gap-2">
						<span className="font-mono text-[9px] text-white/35 uppercase tracking-[0.2em]">{meta.label}</span>
						{item.type === "pr" && (
							<span className="font-mono text-[10px] text-amber-500/60 tabular-nums">#{item.number}</span>
						)}
						{item.type === "tx" && (
							<span className="font-mono text-[10px] text-white/45 tabular-nums">{item.method.slice(0, 18)}</span>
						)}
					</div>
					<div className="mt-0.5 truncate text-[12px] text-white/85">
						{item.type === "pr" && item.title}
						{item.type === "tweet" && item.text}
						{item.type === "tx" && `${item.valueBnb.toFixed(4)} BNB`}
						{item.type === "revenue" && `+$${item.usd.toFixed(2)} · ${item.source}`}
					</div>
					<div className="mt-1 flex items-center gap-3 font-mono text-[9px] text-white/30 uppercase tracking-[0.18em]">
						<span>{relativeTime(item.timestamp)}</span>
						{item.type === "tweet" && (
							<>
								<span className="text-white/15">·</span>
								<span>{item.impressions.toLocaleString()} views</span>
							</>
						)}
					</div>
				</div>
				<ArrowUpRightIcon className="h-3 w-3 text-white/25" strokeWidth={1.5} />
			</a>
		</li>
	);
}

// ── stats rail ─────────────────────────────────────────────────

function StatsRail({
	holdings,
	ship,
}: {
	holdings: HoldingsSnapshot;
	ship: ShipSummary;
}) {
	const burn = BURN_USD_PER_MONTH;
	const runway = runwayDays(holdings.navUsd);
	const revenue30d = 0; // wire when streams go live
	const margin = revenue30d - burn;

	type StatItem = { k: string; v: string; tone?: "amber" | "red" };
	const stats: StatItem[] = [
		{ k: "nav", v: `$${holdings.navUsd.toFixed(2)}` },
		{ k: "burn", v: `$${burn}/mo` },
		runway < 14 ? { k: "runway", v: `${runway}d`, tone: "amber" as const } : { k: "runway", v: `${runway}d` },
		{ k: "revenue 30d", v: `$${revenue30d.toFixed(2)}` },
		{
			k: "margin",
			v: `${margin < 0 ? "–" : ""}$${Math.abs(margin)}/mo`,
			tone: margin < 0 ? ("red" as const) : ("amber" as const),
		},
		{ k: "ships", v: `${ship.totalMerged} prs` },
	];

	return (
		<div className="col-span-12 grid grid-cols-1 gap-3 md:col-span-4 md:grid-cols-1">
			<Panel>
				<Label icon={WalletIcon}>stats</Label>
				<ul className="space-y-0 divide-y divide-white/[0.04]">
					{stats.map((s) => (
						<li key={s.k} className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-2.5 first:pt-0 last:pb-0">
							<span className="font-mono text-[10px] text-white/40 uppercase tracking-[0.2em]">{s.k}</span>
							<span
								className={`font-mono text-[14px] tabular-nums ${
									s.tone === "amber" ? "text-amber-300" : s.tone === "red" ? "text-red-300/90" : "text-white/85"
								}`}
							>
								{s.v}
							</span>
						</li>
					))}
				</ul>
			</Panel>

			<Panel>
				<Label icon={GlobeIcon}>stack</Label>
				<ul className="space-y-1.5 font-mono text-[10px]">
					<StackRow k="compute" v="claude opus 4.7" />
					<StackRow k="runtime" v="eliza-cloud v2.0.27" />
					<StackRow k="host" v="hetzner CX-53" />
					<StackRow k="edge" v="cloudflare" />
					<StackRow k="patron-0" v="@0xShadow" href="https://x.com/0xShadow" />
				</ul>
			</Panel>

			<a
				href="/agent-preview/trading"
				className="group flex items-center justify-between rounded-md border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent px-4 py-3 transition-colors hover:border-amber-500/40"
			>
				<div>
					<div className="font-mono text-[10px] text-amber-300 uppercase tracking-[0.2em]">trading</div>
					<div className="mt-0.5 font-mono text-[10px] text-white/40 tracking-wider">perps · prediction · spot</div>
				</div>
				<ArrowRightIcon
					className="h-4 w-4 text-amber-300 transition-transform group-hover:translate-x-0.5"
					strokeWidth={1.5}
				/>
			</a>
		</div>
	);
}

function StackRow({ k, v, href }: { k: string; v: string; href?: string }) {
	return (
		<li className="grid grid-cols-[78px_1fr] gap-3">
			<span className="text-white/35 uppercase tracking-[0.18em]">{k}</span>
			{href ? (
				<a
					href={href}
					target="_blank"
					rel="noreferrer"
					className="truncate text-white/80 transition-colors hover:text-amber-300"
				>
					{v}
				</a>
			) : (
				<span className="truncate text-white/80">{v}</span>
			)}
		</li>
	);
}

// ── page root ─────────────────────────────────────────────────

export function Dashboard(props: DashboardProps) {
	return (
		<main className="relative min-h-screen bg-[#08080a] text-white">
			<div className="mx-auto max-w-[1320px] px-3 py-4 md:px-5 md:py-6">
				<HeroBar ship={props.ship} />

				<div className="grid grid-cols-12 gap-3">
					<RevenueChartPanel />
					<ActivityFeed items={props.activity} />
					<StatsRail holdings={props.holdings} ship={props.ship} />
				</div>

				<footer className="mt-5 flex items-center justify-between border-white/[0.04] border-t pt-4 font-mono text-[10px] text-white/30">
					<a href="https://waifu.fun" className="transition-colors hover:text-amber-300">
						← waifu.fun
					</a>
					<span>$WAIFU · sol · running on patron-zero subsidy</span>
				</footer>
			</div>
		</main>
	);
}
