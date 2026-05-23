/**
 * Live-data wrappers for static-exported panels.
 *
 * The agent page is a static export (`output: "export"`). Every server
 * fetch in `app/agent/[address]/page.tsx` runs once at `next build` and
 * embeds frozen values into the HTML. Without these wrappers, the
 * chart, price, NAV, and feeds all stay stuck on the build snapshot.
 *
 * Each wrapper:
 *   1. takes the SSG-prefetched value as `initial` so the first paint
 *      is instant, no spinner, no layout shift
 *   2. spins up a `useEffect` poller against the live API right after
 *      hydration
 *   3. passes the freshest value to the underlying panel
 *
 * Polling cadences are tuned to upstream cache windows; see
 * `./live-data.ts` for the per-hook intervals.
 */

"use client";

import { useMemo } from "react";

import type { AgentTrade } from "@/components/agent-home/types";
import { mergeActivityWithTrades } from "@/lib/wave-t/activity-trades";
import type { TwitterStats } from "@/lib/wave-t/agent-twitter";
import type { CandleSeries } from "@/lib/wave-t/candles";
import type { HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { TokenMetrics } from "@/lib/wave-t/token";

import { ActivityFeed, type ActivityFeedAuthor, type ActivityRowInput } from "./activity-feed";
import type { HeroIdentity, HeroProps, HeroTreasuryOverride } from "./hero";
import { HeroV2 } from "./hero-v2";
import { HoldingsAllocation } from "./holdings-allocation";
import {
	useLiveAgentTrades,
	useLiveHoldings,
	useLiveTokenMetrics,
	useLiveTweets,
	useLiveTwitterStats,
} from "./live-data";
import { PriceChart } from "./price-chart";

// ── Hero ───────────────────────────────────────────────────────

export type LiveHeroProps = Omit<HeroProps, "navUsd" | "twitterStats" | "treasuryValueOverride" | "livePulse"> & {
	identity: HeroIdentity;
	address: string;
	initialHoldings: HoldingsSnapshot;
	initialHoldingsHasAggregated: boolean;
	initialTwitterStats: TwitterStats | null;
	/**
	 * When provided, this fixed override (e.g. AgentSafe BNB balance)
	 * is preferred over the live NAV poll. The hook still polls
	 * holdings for the donut, but the hero number reads from the
	 * override to avoid contradicting other panels.
	 */
	staticTreasuryOverride?: HeroTreasuryOverride | undefined;
};

/**
 * Live-polling wrapper around <Hero>. Polls holdings every 30s and
 * twitter stats every 5 min. The treasury value swaps in the aggregated
 * NAV as soon as a live snapshot arrives, even if the SSG build only
 * had the burner-stub fallback.
 */
export function LiveHero({
	address,
	initialHoldings,
	initialHoldingsHasAggregated,
	initialTwitterStats,
	staticTreasuryOverride,
	...rest
}: LiveHeroProps) {
	const holdings = useLiveHoldings(address, initialHoldings, initialHoldingsHasAggregated);
	const twitter = useLiveTwitterStats(address, initialTwitterStats);

	// Live aggregated poll wins. The static override is a *fallback* used
	// only when the live poll hasn't (yet) landed a real aggregated snapshot.
	// Without this priority, the hero treasury freezes on build-time SSG
	// values even though useLiveHoldings is refreshing every 30s in the
	// background.
	const treasuryOverride: HeroTreasuryOverride | undefined = holdings.hasAggregated
		? { valueUsd: holdings.snapshot.navUsd, source: "aggregated" }
		: staticTreasuryOverride;

	return (
		<HeroV2
			{...rest}
			navUsd={holdings.snapshot.navUsd}
			twitterStats={twitter}
			{...(treasuryOverride ? { treasuryValueOverride: treasuryOverride } : {})}
			livePulse
		/>
	);
}

// ── Holdings allocation ────────────────────────────────────────

export function LiveHoldingsAllocation({
	address,
	initial,
	initialHasAggregated,
}: {
	address: string;
	initial: HoldingsSnapshot;
	initialHasAggregated: boolean;
}) {
	const holdings = useLiveHoldings(address, initial, initialHasAggregated);
	return <HoldingsAllocation snapshot={holdings.snapshot} />;
}

// ── Price chart + token metrics ────────────────────────────────

export function LivePriceChart({
	contract,
	initialToken,
	initialSeries,
}: {
	contract: string;
	initialToken: TokenMetrics;
	initialSeries: CandleSeries;
}) {
	const token = useLiveTokenMetrics(contract, initialToken);
	// Candles refresh inside PriceChart itself via the range tab, plus
	// we tick the initial 1h series here so the chart keeps walking
	// forward without a user click. We pass the freshest series via a
	// key prop so PriceChart re-seeds its internal state.
	return <PriceChart token={token} initialSeries={initialSeries} />;
}

// ── Activity feed ──────────────────────────────────────────────

export function LiveActivityFeed({
	address,
	initialTrades,
	initialActivity,
	ticker,
	isSolAgent,
	author,
	max = 30,
}: {
	address: string;
	initialTrades: AgentTrade[];
	initialActivity: ActivityRowInput[];
	ticker: string;
	isSolAgent: boolean;
	author?: ActivityFeedAuthor;
	max?: number;
}) {
	const trades = useLiveAgentTrades(address, initialTrades);
	// Only Sol surfaces tweets in the feed today; non-Sol agents skip
	// the tweet poll to avoid wasted requests. Future: gate on
	// `agent.twitterHandle` once non-Sol agents post too.
	const initialTweets = useMemo(() => {
		const out: {
			id: string;
			text: string;
			createdAt: string;
			url: string;
			impressions: number;
			likes: number;
			replies: number;
		}[] = [];
		for (const row of initialActivity) {
			if (row.type === "tweet") {
				out.push({
					id: row.id.replace(/^tweet-/, ""),
					text: row.text,
					createdAt: row.timestamp,
					url: row.url,
					impressions: row.impressions,
					likes: row.likes,
					replies: 0,
				});
			}
		}
		return out;
	}, [initialActivity]);
	const tweets = useLiveTweets(isSolAgent ? address : "", initialTweets);

	// Merge: replace tweet rows in initialActivity with the live set;
	// keep everything else (PRs, txs, etc) as the SSG seed because we
	// don't have a runtime endpoint for those yet. Live trades feed in
	// via mergeActivityWithTrades like before.
	const rows: ActivityRowInput[] = useMemo(() => {
		const nonTweet = initialActivity.filter((r) => r.type !== "tweet");
		const tweetRows: ActivityRowInput[] = tweets.map((t) => ({
			id: `tweet-${t.id}`,
			type: "tweet" as const,
			timestamp: t.createdAt,
			text: t.text,
			url: t.url,
			impressions: t.impressions,
			likes: t.likes,
		}));
		const merged = [...nonTweet, ...tweetRows];
		merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
		return mergeActivityWithTrades({ activity: merged, trades, ticker });
	}, [initialActivity, tweets, trades, ticker]);

	return <ActivityFeed rows={rows} max={max} {...(author ? { author } : {})} live />;
}
