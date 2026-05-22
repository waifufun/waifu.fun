/**
 * AgentHomeV2: the canonical agent surface at `/agent/[address]`.
 *
 * Single scope. Single accent. Mock-faithful Wave T layout. No Wave M
 * chrome, no second container, no `<Section title subtitle>` wrappers.
 * Every data block is a `<Panel>` primitive from `wave-t/_primitives.tsx`
 * and the whole page reads `THEME_TOKENS` from the root.
 *
 * Layout (top to bottom):
 *
 *   TopBar
 *   LiveLaunchBanner            (only when a deposit window is open/closed)
 *   Hero                        (portrait + treasury value + 24h pnl + status)
 *
 *   PriceChart  (2/3)         | SwapPanel    (1/3, 360px)
 *
 *   HoldingsAllocation | ActivePositions | PnlChart | AppsShipped (if Sol)
 *
 *   ActivityFeed (2/3)        | TopAppsByRevenue (1/3, sol-only)
 *
 *   footer: "live data / onchain feed"
 *
 * Container: `max-w-[1440px]` with consistent `px-4 md:px-6` gutter.
 * THEME_TOKENS scoped at the page root so every nested panel resolves
 * the same CSS variables (--accent, --bg-panel, --border-soft, etc).
 *
 * What was stripped in this restore (was bolted on top under a second
 * `max-w-6xl` container, breaking the page in half):
 *   - `<Section title subtitle>` chrome around every Wave M panel
 *   - EconomicsPanel / IdentityPanel / AgentTreasuryPanel /
 *     TaxStreamPanel / RecentActivity render slots
 *   - PostLaunchSurface (its sub-panels use Wave M grammar; we'll
 *     re-introduce post-launch sections later as native `<Panel>` rows)
 *
 * The components themselves are intentionally kept on disk - some
 * still ship from other surfaces (launch page, story preview) and we
 * may rebuild parts of them in Wave T grammar in a later phase.
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type * as React from "react";

import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import type { AgentSafeBalance } from "@/lib/wave-t/agent-safe-balance";
import type { App } from "@/lib/wave-t/apps";
import type { CandleSeries } from "@/lib/wave-t/candles";
import { daysOperating } from "@/lib/wave-t/github";
import type { HoldingsSnapshot } from "@/lib/wave-t/holdings";
import type { Position } from "@/lib/wave-t/positions";
import type { TokenMetrics } from "@/lib/wave-t/token";

import LiveLaunchBanner from "./live-launch-banner";
import type { AgentData, AgentTrade } from "./types";
import { THEME_TOKENS } from "./wave-t/_primitives";
import { ActivePositions } from "./wave-t/active-positions";
import { type ActivityRowInput, ActivityFeed as WaveTActivityFeed } from "./wave-t/activity-feed";
import { AppsShipped, TopAppsByRevenue } from "./wave-t/apps-revenue";
import { Hero, type HeroIdentity, type HeroTreasuryOverride } from "./wave-t/hero";
import { HoldingsAllocation } from "./wave-t/holdings-allocation";
import { PnlChart } from "./wave-t/pnl-chart";
import { PriceChart } from "./wave-t/price-chart";
import { SwapPanel } from "./wave-t/swap-panel";

export interface AgentHomeV2Props {
	agent: AgentData;
	trades: AgentTrade[];
	/**
	 * Pre-fetched wave-M launch row. Null when the token is legacy or
	 * pre-wave-M; the page still renders, just without the live launch
	 * banner and without the AgentSafe treasury readout (Hero falls
	 * back to holdings.navUsd).
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
	 * Optional override for hero days-operating. Defaults to a derived
	 * value from the agent's launch timestamp, or 1 when missing.
	 */
	daysOperating?: number;
	/**
	 * Optional server-fetched AgentSafe BNB balance (USD-valued). When
	 * present the Hero shows this in the Treasury Value cell with a
	 * "agent safe" source pill; when null it falls back to
	 * holdings.navUsd with a "sol burner" source pill.
	 */
	agentSafeBalance?: AgentSafeBalance | null;
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
	positions,
	activity,
	apps,
	daysOperating: daysOperatingOverride,
	agentSafeBalance,
}: AgentHomeV2Props) {
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

	// Merge raw trades into the unified activity stream so we surface a
	// single feed instead of duplicating "wave-t activity" + "last 20
	// trades" on the same page. The Wave T feed already understands the
	// `trade` row variant (with buy/sell tint + tx link), so the mapping
	// is one-to-one: project AgentTrade into ActivityRowInput.
	const mergedActivity = mergeActivityWithTrades({
		activity,
		trades,
		ticker: agent.ticker,
	});

	const treasuryOverride: HeroTreasuryOverride | undefined = agentSafeBalance
		? { valueUsd: agentSafeBalance.valueUsd, source: "agentSafe" }
		: undefined;

	return (
		<main
			className="min-h-[100dvh] bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6 md:py-6">
				<TopBar />

				{/* Optional banner: deposit window open or recently closed.
				    Sits immediately above the hero so it reads as "this
				    agent has something live RIGHT NOW" instead of a footer
				    afterthought. The component returns null when there is
				    no active launch in the open/closed state. */}
				<LiveLaunchBanner tokenAddress={agent.tokenAddress} />

				{/* Row 1: Hero (full width). Spaced with mt-4 instead of a
				    grid gap because the LiveLaunchBanner above may or may
				    not render. */}
				<div className="mt-4">
					<Hero
						identity={heroIdentity}
						daysOperating={days}
						navUsd={navUsd}
						pnl24hPct={0}
						pnl24hUsd={0}
						{...(treasuryOverride ? { treasuryValueOverride: treasuryOverride } : {})}
					/>
				</div>

				{/* Row 2: price chart (2/3) + swap (1/3, 360px fixed). */}
				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" id="trade">
					<PriceChart initialSeries={candles} token={token} />
					<SwapPanel token={token} />
				</div>

				{/* Row 3: holdings allocation / active positions / pnl chart
				    (+ apps-shipped when the agent has shipped apps). 3-up
				    when no apps, 4-up when apps exist. Stays 2-cols at md
				    so panels do not collapse to a single column on tablets. */}
				<div
					className={
						hasApps
							? "mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
							: "mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
					}
				>
					<HoldingsAllocation snapshot={holdings} />
					<ActivePositions positions={positions} />
					<PnlChart />
					{hasApps ? <AppsShipped apps={apps} visibleCount={3} /> : null}
				</div>

				{/* Row 4: unified activity feed (2/3) + top apps by revenue
				    (1/3, sol-only). The activity feed swallows the legacy
				    "last 20 trades" list: both streams ride through one
				    panel. The feed's built-in "Trading" tab filters down
				    to swap / position rows. */}
				<div
					className={hasApps ? "mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" : "mt-4 grid gap-4"}
					id="activity"
				>
					<WaveTActivityFeed max={30} rows={mergedActivity} />
					{hasApps ? <TopAppsByRevenue apps={apps} limit={4} /> : null}
				</div>

				<footer className="mt-6 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					{hasApps ? `live data / ${liveApps} apps shipped` : "live data / onchain feed"}
				</footer>

				{/*
				 * TODO(post-launch): post-launch panels (burn counter, claim
				 * widget, tier ladder, post-launch trade feed) were removed
				 * tonight because the wrapping `PostLaunchSurface` uses Wave
				 * M `SectionHeader` chrome and bespoke borders. Rebuild as
				 * native `<Panel>` rows in a follow-up phase, gated on
				 * `agent.status === "graduated"`.
				 *
				 * TODO(wave-t-rebuilds): Economics / Identity / AgentSafe
				 * treasury / TaxStream were stripped from this page but
				 * still ship on disk. Rebuild them as native `<Panel>`
				 * rows in subsequent phases of the dashboard primitives
				 * roadmap (`projects/waifu/AGENT-DASHBOARD-PRIMITIVES-2026-05-22.md`).
				 */}
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
 * Sorted newest-first. Dedupes by underlying tx hash so an onchain
 * `tx` row (id `onchain-${hash}`) and a `trade` row (id
 * `trade-${hash}-…`) for the same swap collapse to a single entry; the
 * richer `trade` row wins because it carries buy/sell direction and
 * amount.
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

	// Trade rows take priority over generic onchain `tx` rows for the
	// same hash. Build a hash key from either the bscscan url or the
	// explicit onchain id; trade rows are concatenated FIRST so their
	// hash claims the slot.
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
 * Best-effort tx-hash extractor. Pulls the hash off the bscscan url if
 * the row has one (works for `trade`, `tx`, `treasury`, etc), otherwise
 * falls back to the row id. Lowercased so 0xABC and 0xabc collapse.
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
