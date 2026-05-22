/**
 * AgentHomeV2: the canonical agent surface at `/agent/[address]`.
 *
 * Renders as ONE cohesive page — single container width, single theme
 * scope (THEME_TOKENS), single spacing rhythm. The wave-T dashboard and
 * the wave-M chrome have been folded together (no more visual seam).
 *
 * Layout (top → bottom):
 *
 *   TopBar
 *   LiveLaunchBanner            (only when a deposit window is open/closed)
 *   Hero                        (portrait + treasury value + pnl + days operating)
 *
 *   PriceChart  (2/3)         | SwapPanel    (1/3, 360px)
 *   AppsShipped                 (only when sol-only apps list non-empty)
 *
 *   AgentTreasuryPanel (1/2)  | TaxStreamPanel  (1/2)
 *   EconomicsPanel     (1/2)  | IdentityPanel   (1/2)
 *
 *   ActivityFeed (2/3, includes recent trades)
 *                             | TopAppsByRevenue (1/3, sol-only)
 *
 *   PostLaunchSurface           (only when graduated, full width)
 *
 * Container: `max-w-[1440px]` with consistent `px-4 md:px-6` gutter.
 * Spacing: every row separated by `gap-4` inside a single grid, sections
 * stacked with `space-y-4 md:space-y-6` on the parent.
 *
 * The previous version stitched a `max-w-[1440px]` wave-T section on top
 * of a `max-w-6xl` wave-M section, with the theme tokens scoped only to
 * the upper half — producing a hard seam mid-page. That's gone now.
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

import AgentTreasuryPanel from "./agent-treasury-panel";
import EconomicsPanel from "./economics-panel";
import IdentityPanel from "./identity-panel";
import LiveLaunchBanner from "./live-launch-banner";
import TaxStreamPanel from "./tax-stream-panel";
import type { AgentData, AgentTrade } from "./types";
import { THEME_TOKENS } from "./wave-t/_primitives";
import { type ActivityRowInput, ActivityFeed as WaveTActivityFeed } from "./wave-t/activity-feed";
import { AppsShipped, TopAppsByRevenue } from "./wave-t/apps-revenue";
import { Hero, type HeroIdentity } from "./wave-t/hero";
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
	/**
	 * Reserved: positions data was rendered by an ActivePositions panel
	 * that we removed (it shipped hardcoded fixture rows). The prop stays
	 * so the page-level fetch contract is unchanged; we'll consume it
	 * again once the position indexer surfaces real rows.
	 */
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
	positions: _positions, // currently unused; see prop docblock
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
	const hasApps = apps.length > 0;

	// Identity panel renders null when the agent has no traits / x handle /
	// system prompt. When that's the case, EconomicsPanel takes the full
	// row (otherwise it'd sit in the left column with an empty right slot).
	const hasIdentity = !!((agent.traits && agent.traits.length > 0) || agent.twitterHandle || agent.systemPrompt);

	// Merge raw trades into the unified activity stream so we surface a
	// single feed instead of duplicating "wave-t activity" + "last 20
	// trades" on the same page. The Wave T feed already understands the
	// `trade` row variant (with buy/sell tint + tx link), so the mapping
	// is one-to-one — we just project AgentTrade -> ActivityRowInput.
	const mergedActivity = mergeActivityWithTrades({
		activity,
		trades,
		ticker: agent.ticker,
	});

	return (
		<main
			className="min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6 md:py-6">
				<TopBar />

				{/* Optional banner: deposit window open or recently closed. Sits
				    immediately above the hero so it reads as "this agent has
				    something live RIGHT NOW" rather than a footer afterthought.
				    The component itself returns null when there's no active
				    launch in the open/closed state. */}
				<LiveLaunchBanner tokenAddress={agent.tokenAddress} />

				{/* Single content stack. Every direct child is a row, every row
				    is spaced with the same rhythm. No more "wave-t footer →
				    mt-12 banner → wave-m chrome" visual break. */}
				<div className="mt-4 space-y-4 md:space-y-6">
					{/* Hero (full width) */}
					<Hero identity={heroIdentity} daysOperating={days} navUsd={navUsd} pnl24hPct={0} pnl24hUsd={0} />

					{/* Trade row: price chart (2/3) + swap panel (1/3 / 360px) */}
					<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="trade">
						<PriceChart initialSeries={candles} token={token} />
						<SwapPanel token={token} />
					</div>

					{/* Apps shipped (Sol-only). Holdings donut / active positions /
					    pnl chart panels stripped out in
					    feat/agent-page-dynamic-2026-05-22 since they rendered
					    fixture data. They return when real instrumentation lands. */}
					{hasApps ? (
						<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
							<AppsShipped apps={apps} visibleCount={3} />
						</div>
					) : null}

					{/* Treasury (left) + Tax stream (right). Both panels self-label
					    via their internal headers ("agent safe", "tax stream"), so
					    we don't wrap them in extra <Section title=...> boxes.
					    Stacks cleanly on mobile, side-by-side from md up. */}
					<div className="grid gap-4 md:grid-cols-2" id="treasury">
						<AgentTreasuryPanel tokenAddress={agent.tokenAddress} tokenSymbol={agent.ticker} launch={launch} />
						<TaxStreamPanel launch={launch} />
					</div>

					{/* Economics (left) + Identity (right). Same pairing pattern.
					    Identity returns null when the agent has no traits / x
					    handle / system prompt, in which case Economics will
					    occupy the full column slot. */}
					<div className={hasIdentity ? "grid gap-4 md:grid-cols-2" : "grid gap-4"} id="economics">
						<EconomicsPanel launch={launch} />
						{hasIdentity ? <IdentityPanel agent={agent} /> : null}
					</div>

					{/* Unified activity feed (2/3) + top apps by revenue (1/3,
					    sol-only). The activity feed swallows the legacy "last
					    20 trades" list — both pieces of information stream from
					    the same panel now. The feed's built-in "Trading" tab
					    filters down to swap/position rows. */}
					<div className={hasApps ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" : "grid gap-4"} id="activity">
						<WaveTActivityFeed max={30} rows={mergedActivity} />
						{hasApps ? <TopAppsByRevenue apps={apps} limit={4} /> : null}
					</div>

					{/* Post-launch chrome (burn counter, claim widget, post-launch
					    tax stream, trade feed). Only renders for graduated v3
					    launches. Full width so the embedded sub-panels can
					    breathe. */}
					{graduated ? <PostLaunchSurface tokenAddress={agent.tokenAddress} ticker={agent.ticker} /> : null}
				</div>
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

/**
 * Project raw AgentTrade swap events into the wave-T activity feed's
 * `trade` row variant and merge them into the existing activity stream.
 *
 * AgentTrade has buy/sell direction, trader address, raw amount and a
 * bscscan tx id; the feed's `trade` row understands all of that. We
 * pass the agent's own ticker as the asset (every row in the trade
 * stream is a swap of THIS token).
 *
 * Sorted newest-first. Dedupes by underlying tx hash so that an onchain
 * `tx` row (id `onchain-${hash}`) and a `trade` row (id `trade-${hash}-…`)
 * for the same swap collapse to a single entry — the richer `trade` row
 * wins because it carries buy/sell direction and amount.
 */
function mergeActivityWithTrades(opts: {
	activity: ActivityRowInput[];
	trades: AgentTrade[];
	ticker: string;
}): ActivityRowInput[] {
	const asset = opts.ticker ? opts.ticker.toUpperCase() : "TOKEN";
	const tradeRows: ActivityRowInput[] = opts.trades.map((t, idx) => {
		const ms = t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000;
		const amountNum = typeof t.amount === "number" ? t.amount : Number.parseFloat(t.amount);
		const row: ActivityRowInput = {
			id: `trade-${t.txId || idx}-${t.timestamp}`,
			type: "trade",
			timestamp: new Date(Number.isFinite(ms) && ms > 0 ? ms : Date.now()).toISOString(),
			side: t.type === "sell" ? "sell" : "buy",
			asset,
			amount: Number.isFinite(amountNum) ? amountNum : 0,
			priceBnb: 0,
			venue: "PancakeSwap",
			...(t.txId ? { url: `https://bscscan.com/tx/${t.txId}` } : {}),
		};
		return row;
	});

	// Trade rows take priority over generic onchain `tx` rows for the same
	// hash. Build a hash key from either the bscscan url or the explicit
	// onchain id; trade rows are concatenated FIRST so their hash claims
	// the slot.
	const seen = new Set<string>();
	const out: ActivityRowInput[] = [];
	for (const r of [...tradeRows, ...opts.activity]) {
		const key = rowDedupeKey(r);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(r);
	}
	out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
	return out;
}

/**
 * Best-effort tx-hash extractor. Pulls the hash off the bscscan url if the
 * row has one (works for `trade`, `tx`, `treasury`, etc), otherwise falls
 * back to the row id. Lowercased so 0xABC and 0xabc collapse.
 */
function rowDedupeKey(row: ActivityRowInput): string {
	const url = (row as { url?: string }).url;
	if (typeof url === "string") {
		const m = url.match(/0x[a-fA-F0-9]{40,}/);
		if (m) return `tx:${m[0].toLowerCase()}`;
	}
	return `id:${row.id}`;
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
