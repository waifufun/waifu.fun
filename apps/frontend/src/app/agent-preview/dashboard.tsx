/**
 * Wave T compose: thin composition shell.
 *
 * All logic lives in the panels under ./_panels and the data libs
 * under ./lib. This file just wires them into the layout described
 * by the v2 canonical reference:
 *
 *   row 1: Hero (full width)
 *   row 2: PriceChart (2/3)        | SwapPanel (1/3)
 *   row 3: Holdings | Positions | AppsShipped | PnlChart (4 across)
 *   row 4: ActivityFeed (2/3)      | TopAppsByRevenue (1/3)
 *
 * Theme vars are applied at the root so every nested panel resolves
 * var(--accent), var(--bg-base), etc.
 */

"use client";

import type * as React from "react";

import { THEME_TOKENS } from "./_panels/_primitives";
import { ActivePositions } from "./_panels/active-positions";
import { ActivityFeed, type ActivityRowInput } from "./_panels/activity-feed";
import { AppsShipped, TopAppsByRevenue } from "./_panels/apps-revenue";
import { Hero } from "./_panels/hero";
import { HoldingsAllocation } from "./_panels/holdings-allocation";
import { PnlChart } from "./_panels/pnl-chart";
import { PriceChart } from "./_panels/price-chart";
import { SwapPanel } from "./_panels/swap-panel";
import { AppShell } from "./_shell/app-shell";
import type { ActivityItem } from "./lib/activity";
import { SOL_APPS } from "./lib/apps";
import type { CandleSeries } from "./lib/candles";
import { type ShipSummary, daysOperating } from "./lib/github";
import type { HoldingsSnapshot } from "./lib/holdings";
import type { Position } from "./lib/positions";
import type { TokenMetrics } from "./lib/token";
import type { WatchlistEntry } from "./lib/watchlist";

type Props = {
	token: TokenMetrics;
	tokenAddress: string;
	initialCandles: CandleSeries;
	holdings: HoldingsSnapshot;
	ship: ShipSummary;
	activity: ActivityItem[];
	positions: Position[];
	watchlist: WatchlistEntry[];
};

export function Dashboard({ token, initialCandles, holdings, ship, activity, positions, watchlist }: Props) {
	const navUsd = holdings.navUsd;
	const days = daysOperating(ship.first);

	// ActivityRowInput is a union that already accepts ActivityItem,
	// so foundation activity items flow straight in.
	const rows: ActivityRowInput[] = activity;

	const liveApps = SOL_APPS.filter((a) => a.status === "live").length;

	return (
		<div style={THEME_TOKENS as React.CSSProperties}>
			<AppShell activeNavId="overview" watchlist={watchlist}>
				<div className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6 md:py-6">
					{/* Row 1: hero (full width) */}
					<Hero daysOperating={days} navUsd={navUsd} pnl24hPct={0} pnl24hUsd={0} />

					{/* Row 2: chart (2/3) + swap (1/3) */}
					<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
						<PriceChart initialSeries={initialCandles} token={token} />
						<SwapPanel token={token} />
					</div>

					{/* Row 3: holdings / positions / apps-shipped / pnl */}
					<div className="mt-4 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
						<HoldingsAllocation snapshot={holdings} />
						<ActivePositions positions={positions} />
						<AppsShipped apps={SOL_APPS} visibleCount={3} />
						<PnlChart />
					</div>

					{/* Row 4: activity feed (2/3) + top apps (1/3) */}
					<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
						<ActivityFeed max={8} rows={rows} />
						<TopAppsByRevenue apps={SOL_APPS} limit={4} />
					</div>

					<footer className="mt-6 pb-2 font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.18em]">
						live data · {liveApps} apps shipped · {ship.totalMerged} prs merged
					</footer>
				</div>
			</AppShell>
		</div>
	);
}
