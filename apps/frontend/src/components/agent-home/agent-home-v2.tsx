/**
 * AgentHomeV2: the canonical agent surface at `/agent/[address]`.
 *
 * Pure-function of (agent, apps, events). Every panel is gated on data
 * presence, never on identity. No `isSolAgent`, no `isArchitectByHandle`,
 * no `canonicalSol` overrides. Whatever the persona endpoint returns is
 * what renders.
 *
 * Layout (top to bottom):
 *
 *   TopBar
 *   LiveLaunchBanner            (only when a deposit window is open/closed)
 *   LiveHero                    (portrait + bio | treasury + stats incl. runway)
 *   LivePriceChart  (2/3)     | SwapPanel    (1/3, 360px)
 *   LiveHoldingsAllocation (1fr)  | ActivePositions (1.4fr)
 *   PnlChart                       | AppsShipped (merged: platform products + revenue apps)
 *   BurnRatePanel                  (renders only when agent.burn is populated)
 *   TokenomicsPanel                (supply, burn, treasury, tax-stream split)
 *   LiveActivityFeed (2/3)    | TopAppsByRevenue (1/3)
 *   TopUpPanel
 *   footer (days since launch, generic)
 *
 * 2026-05-25 ingestion-system refactor: killed every Sol-specific code
 * path. Apps merged into one panel (formerly ThingsIBuilt + AppsShipped).
 * Trade History panel collapsed into Activity Feed's Trading tab.
 * Runway promoted to the hero stat strip via shared selector.
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import type { Erc8004IdentityRecord } from "@/lib/erc8004/types";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import type { AgentSafeBalance } from "@/lib/wave-t/agent-safe-balance";
import type { TwitterStats } from "@/lib/wave-t/agent-twitter";
import type { App } from "@/lib/wave-t/apps";
import type { CandleSeries } from "@/lib/wave-t/candles";
import { daysOperating } from "@/lib/wave-t/github";
import type { HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { Position } from "@/lib/wave-t/positions";
import { computeRunway } from "@/lib/wave-t/runway";
import type { TokenMetrics } from "@/lib/wave-t/token";

import type { HyperliquidPosition } from "@/lib/hooks/use-hyperliquid-positions";
import type { PnlSeriesPoint } from "@/lib/wave-t/pnl";
import LiveLaunchBanner from "./live-launch-banner";
import { ProvenancePanel } from "./provenance-panel";
import type { AgentData, AgentTrade } from "./types";
import { THEME_TOKENS } from "./wave-t/_primitives";
import type { ActivityRowInput } from "./wave-t/activity-feed";
import { AppsShipped, TopAppsByRevenue } from "./wave-t/apps-revenue";
import { BurnRatePanel } from "./wave-t/burn-rate-panel";
import type { HeroIdentity, HeroTreasuryOverride } from "./wave-t/hero";
import {
	LiveActivePositions,
	LiveActivityFeed,
	LiveHero,
	LiveHoldingsAllocation,
	LivePriceChart,
} from "./wave-t/live-wrappers";
import { PnlChart } from "./wave-t/pnl-chart";
import { SwapPanel } from "./wave-t/swap-panel";
import { TokenomicsPanel } from "./wave-t/tokenomics-panel";
import { TopUpPanel } from "./wave-t/topup-panel";

export interface AgentHomeV2Props {
	agent: AgentData;
	trades: AgentTrade[];
	launch: AgentLaunchByToken | null;
	token: TokenMetrics;
	candles: CandleSeries;
	holdings: HoldingsSnapshot;
	holdingsSource?: "aggregated" | "empty";
	runwayDays?: number | null;
	twitterStats?: TwitterStats | null;
	positions: Position[];
	/**
	 * SSG-prefetched open perp positions, derived from the /holdings
	 * snapshot's `perpsPositions[]`. The live wrapper refreshes these on
	 * the holdings cadence. Empty for spot-only / unfunded agents.
	 */
	hyperliquidPositions?: HyperliquidPosition[];
	activity: ActivityRowInput[];
	apps: App[];
	daysOperating?: number;
	agentSafeBalance?: AgentSafeBalance | null;
	/**
	 * Pre-computed PnL series for the 30d chart. Derived from nav-history
	 * at the page boundary via `selectPnlSeries`. Empty array → chart
	 * renders its honest empty state. No mock fallback, no flat-zero line.
	 */
	pnlSeries?: PnlSeriesPoint[];
	/**
	 * Optional baseline NAV used by the PnL chart to derive a percentage
	 * delta vs the opening snapshot. When absent the chart falls back to
	 * a 0% display while still rendering the signed dollar total.
	 */
	pnlBaselineNav?: number | null;
	/**
	 * Optional ERC-8004 on-chain identity record for the agent. When
	 * present, the hero shows a verified badge and the page renders an
	 * `<ProvenancePanel>`. When null/undefined, nothing renders (no
	 * 'not verified' copy — absence is the honest default).
	 */
	identity?: Erc8004IdentityRecord | null;
}

/**
 * AgentHomeV2 is the canonical agent page surface. All panels live in
 * one themed container; section grouping is grid-based, not section-tag
 * based.
 */
export default function AgentHomeV2({
	agent,
	trades,
	launch,
	token,
	candles,
	holdings,
	holdingsSource = "empty",
	runwayDays = null,
	twitterStats = null,
	positions,
	hyperliquidPositions = [],
	activity,
	apps,
	daysOperating: daysOperatingOverride,
	agentSafeBalance,
	identity = null,
	pnlSeries,
	pnlBaselineNav = null,
}: AgentHomeV2Props) {
	// Hero identity: prefer the short bio when set, fall back to the full
	// description. The persona endpoint owns both; we never override here.
	const heroBio = agent.bioShort ?? agent.description;
	const heroIdentity: HeroIdentity = {
		name: agent.name,
		ticker: agent.ticker,
		description: heroBio,
		image: agent.image,
		// Verified checkmark stays as the legacy ambient mark when no
		// ERC-8004 identity is present. When identity *is* present,
		// HeroIdentity.erc8004 supersedes it with the rich badge.
		verified: true,
		twitterHandle: agent.twitterHandle,
		tokenAddress: launch?.token ?? agent.tokenAddress,
		...(identity ? { erc8004: identity } : {}),
	};

	const days = daysOperatingOverride ?? deriveDaysOperating(agent, launch);
	const initialHoldingsHasAggregated = holdingsSource === "aggregated";

	// Treasury source priority (mirrors previous logic). The live hook
	// upgrades to "aggregated" automatically when it lands a real
	// /holdings snapshot, even if the SSG build only had the burner stub.
	const staticTreasuryOverride: HeroTreasuryOverride | undefined =
		holdingsSource === "aggregated"
			? { valueUsd: holdings.navUsd, source: "aggregated" }
			: agentSafeBalance
				? { valueUsd: agentSafeBalance.valueUsd, source: "agentSafe" }
				: undefined;

	// Treasury value used by the burn-rate panel for runway. Prefer
	// aggregated nav, fall back to the agent-safe override. Same logic
	// the hero strip uses via computeRunway.
	const burnTreasuryUsd = holdingsSource === "aggregated" ? holdings.navUsd : (agentSafeBalance?.valueUsd ?? null);

	// Runway preference order:
	//   1. server-provided burn-rate snapshot (legacy /burn-rate endpoint)
	//   2. computed locally from persona.monthlyBurnUsd + treasury
	//   3. null (renders "unmeasured" in the hero)
	const computedRunway = computeRunway(burnTreasuryUsd, agent.monthlyBurnUsd);
	const effectiveRunwayDays = runwayDays ?? computedRunway.days;

	// Panel gating. Each renders only when its data is present.
	const burnItems = agent.burn ?? [];
	const monthlyBurnUsd = agent.monthlyBurnUsd ?? null;
	const hasBurnData = burnItems.length > 0 && typeof monthlyBurnUsd === "number" && monthlyBurnUsd > 0;
	const hasApps = apps.length > 0;

	return (
		<main
			className="relative min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="relative z-10 mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6 md:py-6">
				<TopBar />

				{/* Optional banner: deposit window open or recently closed. */}
				<LiveLaunchBanner tokenAddress={agent.tokenAddress} />

				{/* Row 1: Hero (full width). Asymmetric identity + data strip.
				    Runway lives in the data strip via the shared selector. */}
				<div className="mt-4">
					<LiveHero
						identity={heroIdentity}
						address={agent.tokenAddress}
						daysOperating={days}
						pnl24hPct={0}
						pnl24hUsd={0}
						runwayDays={effectiveRunwayDays}
						initialHoldings={holdings}
						initialHoldingsHasAggregated={initialHoldingsHasAggregated}
						initialTwitterStats={twitterStats}
						staticTreasuryOverride={staticTreasuryOverride}
					/>
				</div>

				{/* Row 2: price chart (2/3) + swap (1/3, 360px fixed). */}
				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="trade">
					<LivePriceChart contract={token.contract} initialToken={token} initialSeries={candles} />
					<SwapPanel token={token} />
				</div>

				{/* Row 3: holdings allocation + active positions. */}
				<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
					<LiveHoldingsAllocation
						address={agent.tokenAddress}
						initial={holdings}
						initialHasAggregated={initialHoldingsHasAggregated}
					/>
					<LiveActivePositions
						address={agent.tokenAddress}
						positions={positions}
						initialHyperliquidPositions={hyperliquidPositions}
					/>
				</div>

				{/* Row 4: pnl chart + apps shipped (unified). The apps panel
				    handles its own empty state ("no apps yet") so the column
				    layout stays stable for every agent. */}
				<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
					{pnlSeries && pnlSeries.length > 0 ? (
						<PnlChart series={pnlSeries} baselineNav={pnlBaselineNav} />
					) : (
						<PnlChart />
					)}
					<AppsShipped apps={apps} visibleCount={4} />
				</div>

				{/* Row 4b: burn rate panel. Only renders when the persona
				    endpoint returned burn line items + a monthly total.
				    Agents without burn data simply skip this row. */}
				{hasBurnData && (
					<div className="mt-4" id="burn">
						<BurnRatePanel
							lineItems={burnItems}
							monthlyUsd={monthlyBurnUsd as number}
							treasuryUsd={burnTreasuryUsd}
							last30dRevenueUsd={null}
						/>
					</div>
				)}

				{/* Row 5: tokenomics. supply, burn, treasury, tax-stream split.
				    All figures real on-chain reads or honest empty states. */}
				<div className="mt-6 md:mt-8" id="tokenomics">
					<TokenomicsPanel
						token={{
							symbol: token.symbol || agent.ticker,
							priceUsd: token.priceUsd,
							marketCap: token.marketCap || agent.marketCapUsd || 0,
							holders: token.holders || agent.holderCount || 0,
							totalSupply: token.totalSupply,
							burnedSupply: token.burnedSupply,
							decimals: token.decimals,
						}}
						treasuryUsd={burnTreasuryUsd ?? agent.treasuryNavUsd ?? null}
					/>
				</div>

				{/* Row 6: unified activity feed (2/3) + top apps by revenue
				    (1/3). Activity feed has a Trading tab that subsumes the
				    old TradeHistoryPanel; we no longer render that panel. */}
				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="activity">
					<LiveActivityFeed
						address={agent.tokenAddress}
						initialTrades={trades}
						initialActivity={activity}
						ticker={agent.ticker}
						twitterPollingEnabled={agent.twitterPollingEnabled ?? Boolean(agent.twitterHandle)}
						{...(agent.image || agent.twitterHandle
							? {
									author: {
										...(agent.image ? { avatarUrl: agent.image } : {}),
										...(agent.twitterHandle ? { twitterHandle: agent.twitterHandle } : {}),
									},
								}
							: {})}
						max={30}
					/>
					{hasApps ? <TopAppsByRevenue apps={apps} limit={4} /> : <EmptyAside copy="no app revenue yet" />}
				</div>

				{/* On-chain identity / provenance panel (ERC-8004). Renders
				    nothing when the agent has no identity record. Trade History
				    panel was collapsed into the Activity Feed's Trading tab. */}
				{identity ? (
					<div className="mt-4">
						<ProvenancePanel identity={identity} />
					</div>
				) : null}

				{/* Patron top-up widget. */}
				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="topup">
					<div className="hidden lg:block" aria-hidden />
					<TopUpPanel agentTicker={agent.ticker} agentTokenAddress={agent.tokenAddress} />
				</div>

				<footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					<span>live data · day {days}</span>
					{agent.featuredCounter?.label ? (
						<>
							<span className="text-[var(--text-tertiary)]/50">·</span>
							<span>{agent.featuredCounter.label}</span>
						</>
					) : null}
				</footer>
			</div>
		</main>
	);
}

/**
 * Best-effort derivation of an operating-days number for the hero
 * StatusCard. Prefers the launch timestamp; falls back to lastActionAt.
 */
function deriveDaysOperating(agent: AgentData, launch: AgentLaunchByToken | null): number {
	// featured counter takes precedence if provided
	const counterStart = agent.featuredCounter?.startedAt;
	if (counterStart) {
		const iso = /^\d+$/.test(counterStart)
			? new Date(Number(counterStart) * (counterStart.length <= 10 ? 1000 : 1)).toISOString()
			: counterStart;
		const d = daysOperating(iso);
		if (Number.isFinite(d)) return Math.max(1, d);
	}
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

function EmptyAside({ copy }: { copy: string }) {
	return (
		<aside className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-panel)] p-4 md:p-5">
			<div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)] mb-3">
				top apps
			</div>
			<div className="py-4 font-mono text-[11px] text-[var(--text-tertiary)]">{copy}</div>
		</aside>
	);
}
