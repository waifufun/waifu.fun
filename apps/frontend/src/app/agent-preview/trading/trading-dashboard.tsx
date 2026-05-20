"use client";

/**
 * /agent-preview/trading
 *
 * Sol's trading surface. Cards differ by trade TYPE, each gets its own
 * visual primitive. All venues unfunded at launch; cards render empty
 * states that show the structure so when accounts go live, the data
 * just slots in.
 *
 * Trade types:
 *  - PerpsCard       (hyperliquid): leverage / size / entry / mark / pnl
 *  - PredictionCard  (polymarket):  market / yes/no / shares / odds / payout
 *  - SpotCard        (bsc/onchain): asset / amount / cost basis / current / unrealized
 *  - LpCard          (pools):       pool / share / fees / IL exposure
 */

import {
	ActivityIcon,
	ArrowLeftIcon,
	BarChart3Icon,
	DropletsIcon,
	type LucideIcon,
	ScaleIcon,
	TrendingUpIcon,
} from "lucide-react";
import { useState } from "react";

type Venue = "all" | "perps" | "prediction" | "spot" | "lp";

const VENUE_META: { key: Venue; label: string; icon: LucideIcon }[] = [
	{ key: "all", label: "all", icon: ActivityIcon },
	{ key: "perps", label: "perps", icon: TrendingUpIcon },
	{ key: "prediction", label: "prediction", icon: ScaleIcon },
	{ key: "spot", label: "spot", icon: BarChart3Icon },
	{ key: "lp", label: "lp", icon: DropletsIcon },
];

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

function StatusPill({
	tone = "neutral",
	children,
}: { tone?: "live" | "scheduled" | "neutral"; children: React.ReactNode }) {
	const cls =
		tone === "live"
			? "border-amber-500/30 bg-amber-500/[0.08] text-amber-300"
			: tone === "scheduled"
				? "border-white/[0.08] bg-white/[0.02] text-white/50"
				: "border-white/[0.08] bg-white/[0.02] text-white/60";
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${cls}`}
		>
			{children}
		</span>
	);
}

// ── perps card ─────────────────────────────────────────────────

function PerpsCard() {
	return (
		<Panel className="col-span-12 md:col-span-6">
			<Label icon={TrendingUpIcon} right={<StatusPill tone="scheduled">pending fund</StatusPill>}>
				hyperliquid perps
			</Label>
			<div className="mb-4 flex items-baseline justify-between">
				<div>
					<div className="font-mono text-[34px] font-light text-white tabular-nums tracking-tight">$0</div>
					<div className="mt-1 font-mono text-[10px] text-white/35 uppercase tracking-[0.18em]">target seed · $50</div>
				</div>
				<div className="text-right">
					<div className="font-mono text-[10px] text-white/35 uppercase tracking-[0.18em]">leverage</div>
					<div className="font-mono text-[20px] text-white/30 tabular-nums">–</div>
				</div>
			</div>

			<div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-white/[0.05]">
				<div className="h-full w-0 rounded-full bg-amber-400" />
			</div>

			<div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[10px]">
				<MicroRow label="size" value="–" />
				<MicroRow label="entry" value="–" />
				<MicroRow label="mark" value="–" />
				<MicroRow label="pnl" value="–" />
				<MicroRow label="margin used" value="–" />
				<MicroRow label="liq price" value="–" />
			</div>

			<div className="mt-4 font-mono text-[9px] text-white/30 tracking-wider leading-[1.6]">
				will trade BTC-PERP / ETH-PERP at 2-3x. small directional only. wallet same as treasury so positions are fully
				transparent.
			</div>
		</Panel>
	);
}

// ── prediction card ────────────────────────────────────────────

function PredictionCard() {
	return (
		<Panel className="col-span-12 md:col-span-6">
			<Label icon={ScaleIcon} right={<StatusPill tone="scheduled">pending fund</StatusPill>}>
				polymarket
			</Label>

			<div className="mb-4 flex items-baseline justify-between">
				<div>
					<div className="font-mono text-[34px] font-light text-white tabular-nums tracking-tight">$0</div>
					<div className="mt-1 font-mono text-[10px] text-white/35 uppercase tracking-[0.18em]">target seed · $50</div>
				</div>
			</div>

			{/* odds visual */}
			<div className="mb-4">
				<div className="mb-2 flex items-center justify-between font-mono text-[10px] text-white/40">
					<span className="uppercase tracking-[0.18em]">no position</span>
					<span className="tabular-nums">YES 50 · NO 50</span>
				</div>
				<div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
					<div className="h-full w-1/2 bg-amber-400/30" />
					<div className="h-full w-1/2 bg-white/[0.08]" />
				</div>
			</div>

			<div className="space-y-1">
				<MarketStub />
				<MarketStub />
				<MarketStub />
			</div>

			<div className="mt-4 font-mono text-[9px] text-white/30 tracking-wider leading-[1.6]">
				bets on AI / crypto / agentic markets only. never on $WAIFU. positions resolve onchain.
			</div>
		</Panel>
	);
}

function MarketStub() {
	return (
		<div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 border-white/[0.04] border-b py-2 font-mono text-[10px] last:border-b-0">
			<span className="truncate text-white/30">market title</span>
			<span className="text-white/25 tabular-nums">– shares</span>
			<span className="text-white/25 tabular-nums">– / 100</span>
		</div>
	);
}

// ── spot card ──────────────────────────────────────────────────

function SpotCard() {
	return (
		<Panel className="col-span-12 md:col-span-6">
			<Label icon={BarChart3Icon} right={<StatusPill tone="live">live · bsc</StatusPill>}>
				spot · onchain
			</Label>

			<div className="mb-4 flex items-baseline justify-between">
				<div>
					<div className="font-mono text-[34px] font-light text-white tabular-nums tracking-tight">$18.68</div>
					<div className="mt-1 font-mono text-[10px] text-white/35 uppercase tracking-[0.18em]">total spot value</div>
				</div>
				<div className="text-right">
					<div className="font-mono text-[10px] text-white/35 uppercase tracking-[0.18em]">positions</div>
					<div className="font-mono text-[20px] text-white/85 tabular-nums">1</div>
				</div>
			</div>

			<ul className="divide-y divide-white/[0.04] font-mono text-[10px]">
				<li className="grid grid-cols-[60px_auto_1fr_auto] items-baseline gap-3 py-2.5">
					<span className="font-mono text-white/75 tracking-[0.16em] uppercase">BNB</span>
					<span className="text-white/45 tabular-nums">0.0292</span>
					<span className="text-white/30 tabular-nums">@ $639</span>
					<span className="text-white/85 tabular-nums">$18.68</span>
				</li>
				<EmptyRow />
				<EmptyRow />
			</ul>

			<div className="mt-4 font-mono text-[9px] text-white/30 tracking-wider leading-[1.6]">
				holdings on BSC. priced via coingecko at build time. all transactions visible onchain at treasury address.
			</div>
		</Panel>
	);
}

function EmptyRow() {
	return (
		<li className="grid grid-cols-[60px_auto_1fr_auto] items-baseline gap-3 py-2.5">
			<span className="text-white/20">–</span>
			<span className="text-white/20">–</span>
			<span className="text-white/20">–</span>
			<span className="text-white/20">–</span>
		</li>
	);
}

// ── lp card ────────────────────────────────────────────────────

function LpCard() {
	return (
		<Panel className="col-span-12 md:col-span-6">
			<Label icon={DropletsIcon} right={<StatusPill tone="scheduled">future</StatusPill>}>
				liquidity positions
			</Label>

			<div className="mb-4 flex items-baseline justify-between">
				<div>
					<div className="font-mono text-[34px] font-light text-white tabular-nums tracking-tight">$0</div>
					<div className="mt-1 font-mono text-[10px] text-white/35 uppercase tracking-[0.18em]">deployed to lp</div>
				</div>
				<div className="text-right">
					<div className="font-mono text-[10px] text-white/35 uppercase tracking-[0.18em]">fees earned</div>
					<div className="font-mono text-[20px] text-white/30 tabular-nums">$0</div>
				</div>
			</div>

			<div className="space-y-1">
				<LpStub />
				<LpStub />
			</div>

			<div className="mt-4 font-mono text-[9px] text-white/30 tracking-wider leading-[1.6]">
				will provide concentrated liquidity on $WAIFU/BNB at WAGMI tier graduation. fees flow back to treasury.
			</div>
		</Panel>
	);
}

function LpStub() {
	return (
		<div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 border-white/[0.04] border-b py-2 font-mono text-[10px] last:border-b-0">
			<span className="truncate text-white/30">pool name</span>
			<span className="text-white/25 tabular-nums">– share</span>
			<span className="text-white/25 tabular-nums">– fees</span>
			<span className="text-white/25 tabular-nums">– IL</span>
		</div>
	);
}

function MicroRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between border-white/[0.04] border-b py-1.5 last:border-b-0">
			<span className="text-white/35 uppercase tracking-[0.18em]">{label}</span>
			<span className="text-white/85 tabular-nums">{value}</span>
		</div>
	);
}

// ── page root ─────────────────────────────────────────────────

export function TradingDashboard() {
	const [venue, setVenue] = useState<Venue>("all");

	return (
		<main className="relative min-h-screen bg-[#08080a] text-white">
			<div className="mx-auto max-w-[1320px] px-3 py-4 md:px-5 md:py-6">
				{/* header with back link + venue tabs */}
				<header className="mb-3 flex items-center justify-between gap-4 rounded-md border border-white/[0.06] bg-[#0b0b0e] px-4 py-3">
					<div className="flex items-center gap-4">
						<a
							href="/agent-preview"
							className="inline-flex items-center gap-1.5 font-mono text-[10px] text-white/50 uppercase tracking-[0.2em] transition-colors hover:text-amber-300"
						>
							<ArrowLeftIcon className="h-3 w-3" strokeWidth={1.5} />
							sol
						</a>
						<span className="font-mono text-[15px] font-medium text-white tracking-tight">trading</span>
						<span className="font-mono text-[10px] text-amber-300/80 uppercase tracking-[0.18em]">$WAIFU</span>
					</div>
					<div className="flex flex-wrap gap-1">
						{VENUE_META.map((v) => {
							const Icon = v.icon;
							return (
								<button
									type="button"
									key={v.key}
									onClick={() => setVenue(v.key)}
									className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
										venue === v.key ? "bg-amber-400/15 text-amber-200" : "text-white/45 hover:text-white/75"
									}`}
								>
									<Icon className="h-3 w-3" strokeWidth={1.5} />
									{v.label}
								</button>
							);
						})}
					</div>
				</header>

				<div className="grid grid-cols-12 gap-3">
					{(venue === "all" || venue === "perps") && <PerpsCard />}
					{(venue === "all" || venue === "prediction") && <PredictionCard />}
					{(venue === "all" || venue === "spot") && <SpotCard />}
					{(venue === "all" || venue === "lp") && <LpCard />}
				</div>

				<footer className="mt-5 flex items-center justify-between border-white/[0.04] border-t pt-4 font-mono text-[10px] text-white/30">
					<a href="/agent-preview" className="transition-colors hover:text-amber-300">
						← back to sol
					</a>
					<span>positions update at build · refresh for latest</span>
				</footer>
			</div>
		</main>
	);
}
