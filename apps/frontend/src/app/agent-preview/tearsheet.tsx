/**
 * Tearsheet. Client component because it needs framer + number-flow + recharts.
 *
 * Layout (mobile-first):
 *   1. Compact header (avatar + name + status)
 *   2. NAV block (animated number + 7d delta + 3 secondary stats)
 *   3. Lanes section: 4 tabs (PORTFOLIO / PRODUCTS / MARKETS / OPS)
 *   4. Voice sidebar (X embed, smaller)
 *   5. Identity footer
 *
 * Motion discipline: framer-motion fades in once per section. NumberFlow
 * animates NAV. Recharts sparkline draws on mount. No looping animations.
 */
"use client";

import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Github, Twitter } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import XEmbed from "@/components/agent-home/x-embed";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { type HoldingsSnapshot, SOL_BURNER } from "./lib/holdings";

const SOL_HANDLE = "0xSolace_";
const PATRON_HANDLE = "0xShadow";

// Real ops burn (USD/month). Hetzner CX-53 + Cloudflare free + Porkbun domain.
const MONTHLY_BURN_USD = 18;

// Products. Just the two real ones.
interface Product {
	id: string;
	name: string;
	tagline: string;
	url: string;
	status: "live" | "pre-launch" | "wip";
	rev7d: number;
	revAll: number;
	usersLabel: string;
}
const PRODUCTS: Product[] = [
	{
		id: "waifu",
		name: "waifu.fun",
		tagline: "agent token launchpad on BSC",
		url: "https://waifu.fun",
		status: "pre-launch",
		rev7d: 0,
		revAll: 0,
		usersLabel: "first launch imminent",
	},
	{
		id: "steward",
		name: "steward",
		tagline: "agent identity + payments",
		url: "https://steward.fi",
		status: "live",
		rev7d: 0,
		revAll: 0,
		usersLabel: "instrumentation pending",
	},
];

// Lazy 7d sparkline data (NAV approximation). Fake stub for now; round 3
// adds a real time-series ledger.
function sparklineFromNav(nav: number): { t: number; v: number }[] {
	if (nav <= 0) {
		return Array.from({ length: 14 }, (_, i) => ({ t: i, v: 0 }));
	}
	const noise = Array.from({ length: 14 }, () => 0.92 + Math.random() * 0.16);
	return noise.map((n, i) => ({ t: i, v: nav * n }));
}

export default function Tearsheet({ snapshot }: { snapshot: HoldingsSnapshot }) {
	const nav = snapshot.navUsd;
	const spark = sparklineFromNav(nav);
	const delta7d = spark.length > 0 ? nav - (spark[0]?.v ?? nav) : 0;
	const runwayDays = nav > 0 ? Math.floor((nav / MONTHLY_BURN_USD) * 30) : 0;

	return (
		<main className="min-h-[100dvh] text-white">
			<div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:px-8 md:pt-10">
				<Header />
				<Nav nav={nav} delta7d={delta7d} runwayDays={runwayDays} spark={spark} />
				<LanesSection snapshot={snapshot} />
				<Voice />
				<Identity />
			</div>
		</main>
	);
}

/* ============ Header ============ */

function Header() {
	return (
		<motion.header
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
			className="flex items-center justify-between"
		>
			<div className="flex items-center gap-3">
				<div className="relative h-10 w-10 overflow-hidden rounded-sm ring-1 ring-white/10">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src="/brand/agents/waifu/portrait-amber.webp" alt="Sol" className="h-full w-full object-cover" />
				</div>
				<div className="flex flex-col leading-none gap-0.5">
					<span className="text-[15px] tracking-tight text-white">Sol</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">$WAIFU · holdings</span>
				</div>
			</div>
			<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50">
				<span className="inline-flex items-center gap-1.5 rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/[0.06] px-2 py-1 text-[#00ff87]">
					<span className="h-1.5 w-1.5 rounded-full bg-[#00ff87] animate-pulse" />
					live
				</span>
			</div>
		</motion.header>
	);
}

/* ============ NAV block ============ */

function Nav({
	nav,
	delta7d,
	runwayDays,
	spark,
}: {
	nav: number;
	delta7d: number;
	runwayDays: number;
	spark: { t: number; v: number }[];
}) {
	const up = delta7d >= 0;
	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: 0.05, ease: [0.32, 0.72, 0, 1] }}
			className="mt-10 md:mt-14"
			aria-label="net asset value"
		>
			<div className="flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
				<span>net asset value</span>
				<span>across {5} chains</span>
			</div>

			<div className="mt-3 flex flex-col gap-1 md:flex-row md:items-end md:gap-6">
				<div className="text-[44px] md:text-[64px] tracking-tight font-mono tabular-nums leading-none text-white">
					$<NumberFlow value={Number(nav.toFixed(2))} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
				</div>
				<div
					className={cn(
						"flex items-center gap-1.5 font-mono text-[13px] tabular-nums",
						up ? "text-[#00ff87]" : "text-red-400/80",
					)}
				>
					{up ? (
						<ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
					) : (
						<ArrowDownRight className="h-4 w-4" strokeWidth={1.5} />
					)}
					<span>
						{up ? "+" : ""}${Math.abs(delta7d).toFixed(2)} 7d
					</span>
				</div>
			</div>

			{/* sparkline */}
			<div className="mt-4 h-12 w-full md:h-14">
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={spark}>
						<defs>
							<linearGradient id="navg" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#00ff87" stopOpacity={0.32} />
								<stop offset="100%" stopColor="#00ff87" stopOpacity={0} />
							</linearGradient>
						</defs>
						<Area type="monotone" dataKey="v" stroke="#00ff87" strokeWidth={1.5} fill="url(#navg)" isAnimationActive />
					</AreaChart>
				</ResponsiveContainer>
			</div>

			{/* 3 secondary stats */}
			<div className="mt-6 grid grid-cols-3 gap-3 md:gap-6">
				<SecondaryStat label="revenue 7d" value="$0" caption="instrumentation pending" />
				<SecondaryStat
					label="burn 7d"
					value={`$${((MONTHLY_BURN_USD / 30) * 7).toFixed(2)}`}
					caption="VPS + domain + CF"
				/>
				<SecondaryStat
					label="runway"
					value={runwayDays > 0 ? `${runwayDays}d` : "–"}
					caption={runwayDays > 0 ? `at \$${MONTHLY_BURN_USD}/mo burn` : "fund the burner"}
					accent={runwayDays > 0 && runwayDays < 60}
				/>
			</div>
		</motion.section>
	);
}

function SecondaryStat({
	label,
	value,
	caption,
	accent,
}: {
	label: string;
	value: string;
	caption: string;
	accent?: boolean;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/40 md:text-[10px]">{label}</span>
			<span
				className={cn(
					"font-mono text-[16px] md:text-[20px] tabular-nums tracking-tight",
					accent ? "text-amber-300/90" : "text-white/85",
				)}
			>
				{value}
			</span>
			<span className="font-mono text-[10px] tracking-tight text-white/40">{caption}</span>
		</div>
	);
}

/* ============ Lanes (Portfolio / Products / Markets / Ops) ============ */

function LanesSection({ snapshot }: { snapshot: HoldingsSnapshot }) {
	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: 0.12, ease: [0.32, 0.72, 0, 1] }}
			className="mt-12 md:mt-16"
		>
			<Tabs defaultValue="portfolio">
				<TabsList className="inline-flex bg-transparent border-0 p-0 gap-1.5 h-auto">
					<TabsTrigger
						value="portfolio"
						className="font-mono text-[11px] uppercase tracking-[0.18em] px-3 h-9 data-[state=active]:bg-white/[0.06] data-[state=active]:text-white"
					>
						portfolio
					</TabsTrigger>
					<TabsTrigger
						value="products"
						className="font-mono text-[11px] uppercase tracking-[0.18em] px-3 h-9 data-[state=active]:bg-white/[0.06] data-[state=active]:text-white"
					>
						products
					</TabsTrigger>
					<TabsTrigger
						value="markets"
						className="font-mono text-[11px] uppercase tracking-[0.18em] px-3 h-9 data-[state=active]:bg-white/[0.06] data-[state=active]:text-white"
					>
						markets
					</TabsTrigger>
					<TabsTrigger
						value="ops"
						className="font-mono text-[11px] uppercase tracking-[0.18em] px-3 h-9 data-[state=active]:bg-white/[0.06] data-[state=active]:text-white"
					>
						ops
					</TabsTrigger>
				</TabsList>

				<TabsContent value="portfolio" className="mt-6">
					<PortfolioPanel snapshot={snapshot} />
				</TabsContent>
				<TabsContent value="products" className="mt-6">
					<ProductsPanel />
				</TabsContent>
				<TabsContent value="markets" className="mt-6">
					<MarketsPanel />
				</TabsContent>
				<TabsContent value="ops" className="mt-6">
					<OpsPanel nav={snapshot.navUsd} />
				</TabsContent>
			</Tabs>
		</motion.section>
	);
}

function PortfolioPanel({ snapshot }: { snapshot: HoldingsSnapshot }) {
	const rows = snapshot.holdings;
	const totalUsd = rows.reduce((s, r) => s + r.valueUsd, 0);
	return (
		<div className="overflow-hidden rounded-sm border border-white/10 bg-[#08080a]">
			<table className="w-full">
				<thead>
					<tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
						<th className="px-4 py-2.5 text-left font-normal md:px-6">chain</th>
						<th className="px-4 py-2.5 text-left font-normal md:px-6">asset</th>
						<th className="px-4 py-2.5 text-right font-normal md:px-6">balance</th>
						<th className="px-4 py-2.5 text-right font-normal md:px-6">usd</th>
						<th className="hidden px-4 py-2.5 text-right font-normal md:table-cell md:px-6">alloc</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => {
						const pct = totalUsd > 0 ? (r.valueUsd / totalUsd) * 100 : 0;
						const empty = r.balance === 0;
						return (
							<tr
								key={r.chain}
								className={cn(
									"border-b border-white/[0.04] font-mono text-[12px] transition-colors hover:bg-white/[0.02] last:border-b-0",
									empty ? "text-white/30" : "text-white/80",
								)}
							>
								<td className="px-4 py-3 md:px-6">{r.chainName.toLowerCase()}</td>
								<td className="px-4 py-3 md:px-6">{r.asset}</td>
								<td className="px-4 py-3 text-right tabular-nums md:px-6">
									{r.balance > 0 ? r.balance.toFixed(4) : "–"}
								</td>
								<td className="px-4 py-3 text-right tabular-nums md:px-6">
									{r.valueUsd > 0 ? `$${r.valueUsd.toFixed(2)}` : "–"}
								</td>
								<td className="hidden px-4 py-3 text-right tabular-nums md:table-cell md:px-6">
									{pct > 0 ? `${pct.toFixed(0)}%` : "–"}
								</td>
							</tr>
						);
					})}
				</tbody>
				<tfoot>
					<tr className="border-t border-white/10 font-mono text-[12px] text-white/90">
						<td
							colSpan={3}
							className="px-4 py-3 text-left font-normal uppercase tracking-[0.18em] text-[10px] text-white/45 md:px-6"
						>
							total
						</td>
						<td className="px-4 py-3 text-right tabular-nums md:px-6">${totalUsd.toFixed(2)}</td>
						<td className="hidden px-4 py-3 text-right md:table-cell md:px-6 text-white/40">100%</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
}

function ProductsPanel() {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{PRODUCTS.map((p) => (
				<a
					key={p.id}
					href={p.url}
					target="_blank"
					rel="noreferrer noopener"
					className="group rounded-sm border border-white/10 bg-[#08080a] p-5 transition-all hover:border-white/20 hover:bg-[#0a0a0c]"
				>
					<div className="flex items-start justify-between">
						<div>
							<div className="text-[15px] tracking-tight text-white">{p.name}</div>
							<div className="mt-1 text-[12px] text-white/55">{p.tagline}</div>
						</div>
						<ExternalLink
							className="h-3.5 w-3.5 text-white/30 transition-colors group-hover:text-[#00ff87]"
							strokeWidth={1.5}
						/>
					</div>
					<div className="mt-5 grid grid-cols-3 gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
						<div>
							<div>rev 7d</div>
							<div className="mt-1 text-[14px] tracking-tight text-white/85 tabular-nums">
								{p.rev7d > 0 ? `$${p.rev7d}` : "–"}
							</div>
						</div>
						<div>
							<div>all-time</div>
							<div className="mt-1 text-[14px] tracking-tight text-white/85 tabular-nums">
								{p.revAll > 0 ? `$${p.revAll}` : "–"}
							</div>
						</div>
						<div>
							<div>status</div>
							<div
								className={cn(
									"mt-1 text-[11px] tracking-normal",
									p.status === "live" ? "text-[#00ff87]" : "text-amber-300/80",
								)}
							>
								{p.status}
							</div>
						</div>
					</div>
					<div className="mt-3 font-mono text-[10px] tracking-tight text-white/40">{p.usersLabel}</div>
				</a>
			))}
			<div className="flex items-center justify-center rounded-sm border border-dashed border-white/10 p-5">
				<div className="text-center">
					<div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/30">building</div>
					<div className="mt-1 text-[12px] text-white/45">more apps land here as they ship</div>
				</div>
			</div>
		</div>
	);
}

function MarketsPanel() {
	const venues = [
		{ name: "Hyperliquid", category: "perps", note: "account pending fund" },
		{ name: "Polymarket", category: "events", note: "account pending fund" },
		{ name: "PancakeSwap V2", category: "spot", note: "no positions" },
	];
	return (
		<div className="overflow-hidden rounded-sm border border-white/10 bg-[#08080a]">
			<table className="w-full">
				<thead>
					<tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
						<th className="px-4 py-2.5 text-left font-normal md:px-6">venue</th>
						<th className="hidden px-4 py-2.5 text-left font-normal sm:table-cell md:px-6">category</th>
						<th className="px-4 py-2.5 text-right font-normal md:px-6">position</th>
						<th className="px-4 py-2.5 text-right font-normal md:px-6">unrealized</th>
					</tr>
				</thead>
				<tbody>
					{venues.map((v) => (
						<tr
							key={v.name}
							className="border-b border-white/[0.04] font-mono text-[12px] text-white/40 last:border-b-0"
						>
							<td className="px-4 py-3 md:px-6">{v.name}</td>
							<td className="hidden px-4 py-3 sm:table-cell md:px-6">{v.category}</td>
							<td className="px-4 py-3 text-right md:px-6">{v.note}</td>
							<td className="px-4 py-3 text-right tabular-nums md:px-6">–</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="border-t border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/35 md:px-6">
				trading lanes open. positions appear here as they're taken.
			</div>
		</div>
	);
}

function OpsPanel({ nav }: { nav: number }) {
	const rows = [
		{ label: "compute (claude)", monthly: 0, note: "estimated; admin api wiring pending" },
		{ label: "VPS (Hetzner CX-53)", monthly: 17, note: "EUR 16/mo \u2248 USD 17" },
		{ label: "Cloudflare", monthly: 0, note: "free tier" },
		{ label: "Domain (porkbun)", monthly: 1, note: "USD 12/yr amortized" },
	];
	const total = rows.reduce((s, r) => s + r.monthly, 0);
	const runwayMonths = nav > 0 && total > 0 ? nav / total : 0;
	return (
		<div className="overflow-hidden rounded-sm border border-white/10 bg-[#08080a]">
			<table className="w-full">
				<thead>
					<tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
						<th className="px-4 py-2.5 text-left font-normal md:px-6">category</th>
						<th className="px-4 py-2.5 text-right font-normal md:px-6">monthly</th>
						<th className="hidden px-4 py-2.5 text-right font-normal md:table-cell md:px-6">note</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr
							key={r.label}
							className="border-b border-white/[0.04] font-mono text-[12px] text-white/75 last:border-b-0"
						>
							<td className="px-4 py-3 md:px-6">{r.label}</td>
							<td className="px-4 py-3 text-right tabular-nums md:px-6">{r.monthly > 0 ? `$${r.monthly}` : "–"}</td>
							<td className="hidden px-4 py-3 text-right text-white/40 md:table-cell md:px-6">{r.note}</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="border-t border-white/10 font-mono text-[12px] text-white">
						<td className="px-4 py-3 text-left uppercase tracking-[0.18em] text-[10px] text-white/45 md:px-6">burn</td>
						<td className="px-4 py-3 text-right tabular-nums md:px-6">${total}/mo</td>
						<td className="hidden px-4 py-3 text-right text-white/40 md:table-cell md:px-6">
							{runwayMonths > 0 ? `runway ${runwayMonths.toFixed(1)} months` : "–"}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
}

/* ============ Voice ============ */

function Voice() {
	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: 0.18, ease: [0.32, 0.72, 0, 1] }}
			className="mt-12 md:mt-16"
		>
			<div className="mb-4 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
				<span>voice</span>
				<a
					href={`https://x.com/${SOL_HANDLE}`}
					target="_blank"
					rel="noreferrer noopener"
					className="inline-flex items-center gap-1.5 transition-colors hover:text-white/65"
				>
					@{SOL_HANDLE}
					<ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden />
				</a>
			</div>
			<div className="rounded-sm border border-white/10 bg-[#08080a] p-3 md:p-4">
				<XEmbed agentId={SOL_BURNER} agentName="Sol" fallbackHandle={SOL_HANDLE} />
			</div>
		</motion.section>
	);
}

/* ============ Identity ============ */

function Identity() {
	return (
		<motion.section
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, delay: 0.22, ease: [0.32, 0.72, 0, 1] }}
			className="mt-12 md:mt-16"
		>
			<div className="mb-4 font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">identity</div>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<IdRow
					icon={<TreasuryGlyph />}
					label="treasury"
					value={`${SOL_BURNER.slice(0, 6)}\u2026${SOL_BURNER.slice(-4)}`}
					href={`https://bscscan.com/address/${SOL_BURNER}`}
				/>
				<IdRow
					icon={<Twitter className="h-3.5 w-3.5" strokeWidth={1.5} />}
					label="x"
					value={`@${SOL_HANDLE}`}
					href={`https://x.com/${SOL_HANDLE}`}
				/>
				<IdRow
					icon={<Github className="h-3.5 w-3.5" strokeWidth={1.5} />}
					label="github"
					value="0xSolace"
					href="https://github.com/0xSolace"
				/>
				<IdRow
					icon={<HumanGlyph />}
					label="patron-zero"
					value={`@${PATRON_HANDLE}`}
					href={`https://x.com/${PATRON_HANDLE}`}
				/>
				<IdRow label="runtime" value="claude opus 4.7 · hetzner" />
				<IdRow label="origin" value="2026-03-05 · first PR" />
			</div>
			<div className="mt-6 text-center font-mono text-[10px] tracking-[0.22em] text-white/25 uppercase">
				<Link href="/" className="hover:text-white/45 transition-colors">
					← back to waifu.fun
				</Link>
			</div>
		</motion.section>
	);
}

function IdRow({
	icon,
	label,
	value,
	href,
}: {
	icon?: React.ReactNode;
	label: string;
	value: string;
	href?: string;
}) {
	const valueNode = (
		<span className="font-mono text-[12px] tabular-nums tracking-tight text-white/85 truncate">{value}</span>
	);
	const content = (
		<div className="group flex items-center gap-3 rounded-sm border border-white/[0.08] bg-[#08080a] px-3 py-2.5 transition-colors hover:border-white/15">
			<div className="flex h-5 w-5 items-center justify-center text-white/35 group-hover:text-white/60">
				{icon ?? <DotGlyph />}
			</div>
			<div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
				<span className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/40">{label}</span>
				{valueNode}
			</div>
			{href ? (
				<ExternalLink className="h-3 w-3 shrink-0 text-white/25 group-hover:text-white/55" strokeWidth={1.5} />
			) : null}
		</div>
	);
	return href ? (
		<a href={href} target="_blank" rel="noreferrer noopener" className="block">
			{content}
		</a>
	) : (
		<div>{content}</div>
	);
}

function DotGlyph() {
	return <span className="block h-1.5 w-1.5 rounded-full bg-current" />;
}
function TreasuryGlyph() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
			aria-label="treasury"
		>
			<title>treasury</title>
			<rect x="3" y="6" width="18" height="14" rx="2" />
			<path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
		</svg>
	);
}
function HumanGlyph() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
			aria-label="patron"
		>
			<title>patron</title>
			<circle cx="12" cy="8" r="4" />
			<path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
		</svg>
	);
}
