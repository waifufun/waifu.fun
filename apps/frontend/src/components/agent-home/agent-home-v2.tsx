/**
 * AgentHomeV2: sprint 2 consolidation.
 *
 * The canonical agent surface at `/agent/[address]`. Sprint 2 folded the
 * Wave T panel set into this page so there is exactly one place that
 * renders an agent:
 *
 *   row 1 (Wave T)   Hero strip: portrait, treasury value, 24h pnl, status
 *   row 2 (Wave T)   PriceChart (2/3)        | SwapPanel (1/3)
 *   row 3 (Wave T)   HoldingsAllocation | ActivePositions | PnlChart | (AppsShipped if Sol)
 *   row 4 (Wave T)   ActivityFeed (2/3)      | TopAppsByRevenue (1/3, Sol-only)
 *
 *   then the wave-M chrome (kept as-is):
 *     LiveLaunchBanner, EconomicsPanel, TreasuryPanelV2,
 *     PostLaunchSurface (when graduated), RecentActivity (legacy trades),
 *     IdentityPanel.
 *
 * Wave T panels are themed with their own CSS-vars scope (THEME_TOKENS)
 * applied at the wave-t container; everything below it falls back to the
 * existing AgentHomeV2 chrome. This keeps wave-M panels visually intact.
 *
 * Non-Sol agents still render the apps-revenue panels but in collapsed /
 * empty mode (TopAppsByRevenue + AppsShipped show the empty state). The
 * AppsShipped slot is hidden when the apps list is empty so the row 3
 * grid stays balanced (3-up instead of 4-up).
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import { PostLaunchSurface } from "@/components/post-launch/post-launch-surface";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import type { App } from "@/lib/wave-t/apps";
import type { CandleSeries } from "@/lib/wave-t/candles";
import { daysOperating } from "@/lib/wave-t/github";
import type { HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { Position } from "@/lib/wave-t/positions";
import type { TokenMetrics } from "@/lib/wave-t/token";

import EconomicsPanel from "./economics-panel";
import IdentityPanel from "./identity-panel";
import LiveLaunchBanner from "./live-launch-banner";
import RecentActivity from "./recent-activity";
import TreasuryPanelV2 from "./treasury-panel-v2";
import type { AgentData, AgentTrade } from "./types";
import { THEME_TOKENS } from "./wave-t/_primitives";
import { ActivePositions } from "./wave-t/active-positions";
import { type ActivityRowInput, ActivityFeed as WaveTActivityFeed } from "./wave-t/activity-feed";
import { AppsShipped, TopAppsByRevenue } from "./wave-t/apps-revenue";
import { Hero, type HeroIdentity } from "./wave-t/hero";
import { HoldingsAllocation } from "./wave-t/holdings-allocation";
import { PnlChart } from "./wave-t/pnl-chart";
import { PriceChart } from "./wave-t/price-chart";
import { SwapPanel } from "./wave-t/swap-panel";

export interface AgentHomeV2Props {
	agent: AgentData;
	trades: AgentTrade[];
	/**
	 * Pre-fetched wave-M launch row. Null when the token is legacy or
	 * pre-wave-M; the page still renders, just without economics or
	 * treasury chrome.
	 */
	launch: AgentLaunchByToken | null;
	/** Wave T fetched data; null/undefined slots fall back to empty states. */
	token: TokenMetrics;
	candles: CandleSeries;
	holdings: HoldingsSnapshot;
	positions: Position[];
	activity: ActivityRowInput[];
	apps: App[];
	/**
	 * Optional override for hero days-operating. Defaults to a derived value
	 * from the agent's launch timestamp, or 1 when missing.
	 */
	daysOperating?: number;
}

/**
 * AgentHomeV2 is the canonical agent page surface. Sprint 2 folded the
 * Wave T panel set into it; existing economics/treasury/identity panels
 * are kept below.
 */
export default function AgentHomeV2({
	agent,
	trades,
	launch,
	token,
	candles,
	holdings,
	positions,
	activity,
	apps,
	daysOperating: daysOperatingOverride,
}: AgentHomeV2Props) {
	const graduated = agent.status === "graduated";

	const heroIdentity: HeroIdentity = {
		name: agent.name,
		ticker: agent.ticker,
		description: agent.description,
		image: agent.image,
		verified: true,
	};

	const navUsd = holdings.navUsd;
	const days = daysOperatingOverride ?? deriveDaysOperating(agent, launch);
	const liveApps = apps.filter((a) => a.status === "live").length;
	const hasApps = apps.length > 0;

	return (
		<main className="min-h-[100dvh] text-white">
			{/* Wave T scope: CSS vars applied here so nested panels resolve
			    var(--accent), var(--bg-panel), etc. */}
			<section
				aria-label="agent surface"
				className="bg-[var(--bg-base)] text-[var(--text-primary)]"
				style={THEME_TOKENS as React.CSSProperties}
			>
				<div className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6 md:py-6">
					<TopBar />

					{/* Row 1: Hero (full width) */}
					<div className="mt-4">
						<Hero identity={heroIdentity} daysOperating={days} navUsd={navUsd} pnl24hPct={0} pnl24hUsd={0} />
					</div>

					{/* Row 2: chart (2/3) + swap (1/3) */}
					<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="trade">
						<PriceChart initialSeries={candles} token={token} />
						<SwapPanel token={token} />
					</div>

					{/* Row 3: holdings / positions / pnl (+ apps-shipped if Sol) */}
					<div
						className={
							hasApps
								? "mt-4 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
								: "mt-4 grid gap-4 grid-cols-1 md:grid-cols-3"
						}
					>
						<HoldingsAllocation snapshot={holdings} />
						<ActivePositions positions={positions} />
						<PnlChart />
						{hasApps ? <AppsShipped apps={apps} visibleCount={3} /> : null}
					</div>

					{/* Row 4: activity feed (2/3) + top apps (1/3, Sol-only) */}
					<div
						className={hasApps ? "mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" : "mt-4 grid gap-4"}
						id="activity"
					>
						<WaveTActivityFeed max={8} rows={activity} />
						{hasApps ? <TopAppsByRevenue apps={apps} limit={4} /> : null}
					</div>

					<footer className="mt-6 pb-2 font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.18em]">
						{hasApps ? `live data · ${liveApps} apps shipped` : "live data · onchain feed"}
					</footer>
				</div>
			</section>

			{/* Wave-M chrome (kept as-is): economics / treasury / identity */}
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pb-24">
				{/* live launch banner sits above the economics if there's a
				    deposit window currently open or recently closed. */}
				<div className="mt-12">
					<LiveLaunchBanner tokenAddress={agent.tokenAddress} />
				</div>

				<Section title="economics" subtitle="tier ladder + tax routing">
					<EconomicsPanel launch={launch} />
				</Section>

				<Section title="treasury" subtitle="onchain handles + balances">
					<TreasuryPanelV2
						treasuryLp={launch?.treasuryLp ?? null}
						agentSafe={launch?.agentSafe ?? null}
						taxSplitter={launch?.taxSplitter ?? null}
					/>
				</Section>

				{/* v3 post-launch chrome (burn counter, claim widget, tax
				    stream, trade feed). Only renders for v3 launches in the
				    'launched' state. */}
				{graduated && (
					<div className="mt-12">
						<PostLaunchSurface tokenAddress={agent.tokenAddress} ticker={agent.ticker} />
					</div>
				)}

				<Section title="last 20 trades">
					<RecentActivity trades={trades} />
				</Section>

				<Section title="identity" subtitle="traits + brain">
					<IdentityPanel agent={agent} />
				</Section>
			</div>
		</main>
	);
}

/**
 * Best-effort derivation of an operating-days number for the hero
 * StatusCard. Uses the launch timestamp when available, else the
 * lastActionAt, else 1.
 */
function deriveDaysOperating(agent: AgentData, launch: AgentLaunchByToken | null): number {
	const ts = launch?.launchTimestamp;
	if (typeof ts === "number" && ts > 0) {
		return Math.max(1, daysOperating(new Date(ts * 1000).toISOString()));
	}
	const last = agent.lastActionAt;
	if (typeof last === "number" && last > 0) {
		return Math.max(1, daysOperating(new Date(last).toISOString()));
	}
	return 1;
}

function TopBar() {
	return (
		<div className="flex items-center justify-between">
			<Link
				href="/agents"
				className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50 transition-colors duration-200 hover:text-white/85"
			>
				<ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
				all agents
			</Link>
		</div>
	);
}

function Section({
	title,
	subtitle,
	children,
	id,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
	id?: string;
}) {
	return (
		<section id={id} className="mt-12 scroll-mt-8">
			<div className="mb-4 flex items-baseline justify-between gap-3">
				<h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/60">{title}</h2>
				{subtitle ? (
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">{subtitle}</span>
				) : null}
			</div>
			{children}
		</section>
	);
}
