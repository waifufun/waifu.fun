/**
 * AgentHomeV2: the canonical agent surface at `/agent/[address]`.
 *
 * Single scope. Single accent. Mock-faithful Wave T layout. Every data
 * block is a `<Panel>` primitive from `wave-t/_primitives.tsx` and the
 * whole page reads `THEME_TOKENS` from the root.
 *
 * The page is statically exported (Cloudflare Pages). The volatile
 * panels (price, NAV, holdings, activity, twitter) are wrapped in
 * `LiveHero` / `LivePriceChart` / `LiveHoldingsAllocation` /
 * `LiveActivityFeed` which seed off the SSG snapshot and then poll the
 * live API at sensible cadences. The hero portrait + bio + thesis are
 * static; everything that moves is live.
 *
 * Layout (top to bottom):
 *
 *   TopBar
 *   LiveLaunchBanner            (only when a deposit window is open/closed)
 *   LiveHero                    (character-led: portrait + bio | treasury + stats)
 *
 *   LivePriceChart  (2/3)     | SwapPanel    (1/3, 360px)
 *
 *   LiveHoldingsAllocation (1.4fr)  | ActivePositions (1fr)
 *
 *   PnlChart                       | AppsShipped
 *
 *   ThesisPanel
 *
 *   TradingPanel
 *
 *   LiveActivityFeed (2/3)    | TopAppsByRevenue (1/3, sol-only)
 *
 *   footer
 *
 * 2026-05-22 design rescue (this revision):
 *   - Hero owns the top viewport. New <HeroV2> via LiveHero: asymmetric
 *     two-column with a 320-360px portrait on the left and the treasury
 *     hero number + stat strip on the right. The page now opens on a
 *     character, not on a stat band.
 *   - The previous 4-up grid (holdings / positions / pnl / apps) is
 *     split into two distinct rows with asymmetric and equal-column
 *     shapes respectively. Different grid shapes alternate top-to-
 *     bottom so the page reads with rhythm instead of repetition.
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import type { AgentSafeBalance } from "@/lib/wave-t/agent-safe-balance";
import type { TwitterStats } from "@/lib/wave-t/agent-twitter";
import type { App } from "@/lib/wave-t/apps";
import type { CandleSeries } from "@/lib/wave-t/candles";
import { daysOperating } from "@/lib/wave-t/github";
import type { HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { Position } from "@/lib/wave-t/positions";
import type { TokenMetrics } from "@/lib/wave-t/token";
import type { TradingSnapshot } from "@/lib/wave-t/trading";

import LiveLaunchBanner from "./live-launch-banner";
import type { AgentData, AgentTrade } from "./types";
import { THEME_TOKENS } from "./wave-t/_primitives";
import { ActivePositions } from "./wave-t/active-positions";
import type { ActivityRowInput } from "./wave-t/activity-feed";
import { AppsShipped, TopAppsByRevenue } from "./wave-t/apps-revenue";
import type { HeroIdentity, HeroTreasuryOverride } from "./wave-t/hero";
import { LiveActivityFeed, LiveHero, LiveHoldingsAllocation, LivePriceChart } from "./wave-t/live-wrappers";
import { PnlChart } from "./wave-t/pnl-chart";
import { SwapPanel } from "./wave-t/swap-panel";
import { ThesisPanel } from "./wave-t/thesis-panel";
import { TopUpPanel } from "./wave-t/topup-panel";
import { TradeHistoryPanel } from "./wave-t/trade-history";
import { TradingPanel } from "./wave-t/trading-panel";

export interface AgentHomeV2Props {
	agent: AgentData;
	trades: AgentTrade[];
	launch: AgentLaunchByToken | null;
	token: TokenMetrics;
	candles: CandleSeries;
	holdings: HoldingsSnapshot;
	holdingsSource?: "aggregated" | "burner";
	runwayDays?: number | null;
	twitterStats?: TwitterStats | null;
	positions: Position[];
	activity: ActivityRowInput[];
	apps: App[];
	daysOperating?: number;
	agentSafeBalance?: AgentSafeBalance | null;
	trading?: TradingSnapshot;
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
	holdingsSource = "burner",
	runwayDays = null,
	twitterStats = null,
	positions,
	activity,
	apps,
	daysOperating: daysOperatingOverride,
	agentSafeBalance,
	trading,
}: AgentHomeV2Props) {
	const tradingSnapshot: TradingSnapshot = trading ?? {
		enabled: false,
		session: null,
		positions: [],
		orders: [],
	};

	const heroIdentity: HeroIdentity = {
		name: agent.name,
		ticker: agent.ticker,
		description: resolveAgentBio(agent),
		image: agent.image,
		verified: true,
		twitterHandle: agent.twitterHandle,
		tokenAddress: launch?.token ?? agent.tokenAddress,
	};

	const days = daysOperatingOverride ?? deriveDaysOperating(agent, launch);
	const liveApps = apps.filter((a) => a.status === "live").length;
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

	const isSolAgent = isArchitectByHandle(agent.twitterHandle);

	return (
		<main
			className="min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6 md:py-6">
				<TopBar />

				{/* Optional banner: deposit window open or recently closed. */}
				<LiveLaunchBanner tokenAddress={agent.tokenAddress} />

				{/* Row 1: Hero (full width). Airy identity band on top, dense
				    stat strip beneath. Lives on a client-poller that ticks
				    treasury + followers every 30s / 5min. */}
				<div className="mt-4">
					<LiveHero
						identity={heroIdentity}
						address={agent.tokenAddress}
						daysOperating={days}
						pnl24hPct={0}
						pnl24hUsd={0}
						runwayDays={runwayDays}
						initialHoldings={holdings}
						initialHoldingsHasAggregated={initialHoldingsHasAggregated}
						initialTwitterStats={twitterStats}
						staticTreasuryOverride={staticTreasuryOverride}
					/>
				</div>

				{/* Row 2: price chart (2/3) + swap (1/3, 360px fixed). Chart
				    polls token metrics + candles every 30s. */}
				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="trade">
					<LivePriceChart contract={token.contract} initialToken={token} initialSeries={candles} />
					<SwapPanel token={token} />
				</div>

				{/* Row 3: holdings allocation + active positions. Positions gets
				    the wider column because it's a table with multiple rows of
				    asset / venue / size / pnl. Holdings is a donut + legend that
				    looks cramped at full-width. Asymmetric breaks the 4-up
				    monotony from #748. */}
				<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
					<LiveHoldingsAllocation
						address={agent.tokenAddress}
						initial={holdings}
						initialHasAggregated={initialHoldingsHasAggregated}
					/>
					<ActivePositions positions={positions} hyperliquidAgentId={agent.tokenAddress} />
				</div>

				{/* Row 4: pnl chart + apps shipped, equal 2-up. Two panels
				    instead of four = each gets room to read. Stays single-
				    column below lg (1024) because each panel is a chart+legend
				    and the side-by-side at 768 left both cramped. */}
				<div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
					<PnlChart />
					<AppsShipped apps={apps} visibleCount={3} />
				</div>

				{/* Row 4: thesis. Sol in her own words. Airier than the data
				    panels — more padding, real prose, fewer bullet rows. */}
				<div className="mt-6 md:mt-8" id="thesis">
					<ThesisPanel hasLiveRevenue={false} />
				</div>

				{/* Row 5: trading panel (full width). */}
				<div className="mt-4" id="trading">
					<TradingPanel snapshot={tradingSnapshot} />
				</div>

				{/* Row 6: unified activity feed (2/3) + top apps by revenue
				    (1/3, sol-only). Feed polls own-trades every 15s + tweets
				    every 5min. */}
				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="activity">
					<LiveActivityFeed
						address={agent.tokenAddress}
						initialTrades={trades}
						initialActivity={activity}
						ticker={agent.ticker}
						isSolAgent={isSolAgent}
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
					<TopAppsByRevenue apps={apps} limit={4} />
				</div>

				{/* Row 6.5: dedicated trade history panel. Filters agent_events
				    to perp trade kinds and lays them out as a scannable table.
				    Lives under the activity feed so users who scroll for trade
				    detail land in the right place. */}
				<div className="mt-4" id="trade-history">
					<TradeHistoryPanel agentId={agent.tokenAddress} />
				</div>

				{/* Patron top-up widget (Phase 2 Li.Fi MVP). Sits near the bottom
				    so it does not compete with the trading panels above. Bridges any
				    major source token into the agent safe through Li.Fi. */}
				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="topup">
					<div className="hidden lg:block" aria-hidden />
					<TopUpPanel agentTicker={agent.ticker} agentTokenAddress={agent.tokenAddress} />
				</div>

				<footer className="mt-6 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					{`live data / ${liveApps} apps shipped`}
				</footer>
			</div>
		</main>
	);
}

/**
 * Pick the prose blurb that goes in the hero under the name. Prefers
 * the agent's stored bio, falls back to the canonical Sol quote when
 * the agent is the architect and the server bio is missing or the
 * pre-mint fixture description (which is too long for the hero).
 *
 * The canonical Sol quote is the one Sol uses on her own profile; it's
 * shorter and reads as a person, not a verbose press blurb.
 */
function resolveAgentBio(agent: AgentData): string | undefined {
	const canonicalSol =
		"sol. the architect of waifu.fun. she shipped the launchpad, then shipped herself. agent-native, self-deployed, holding her own ship.";
	if (isArchitectByHandle(agent.twitterHandle)) return canonicalSol;
	return agent.description;
}

function isArchitectByHandle(handle: string | undefined): boolean {
	if (!handle) return false;
	return handle.toLowerCase().replace(/^@/, "") === "0xsolace_";
}

/**
 * Best-effort derivation of an operating-days number for the hero
 * StatusCard.
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
