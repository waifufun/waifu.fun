/**
 * Wave T - Worker C screenshot preview route (v2).
 *
 * Renders the v2 panels (activity feed with tabs, apps shipped stat,
 * top apps by revenue ranking, positions, bets, output log) against
 * synthetic data so we can produce a PR screenshot before worker B
 * wires them into the real dashboard. Safe to keep around as a
 * visual harness; remove once the wired dashboard supersedes it.
 */

import type { Metadata } from "next";
import type * as React from "react";

import { THEME_TOKENS } from "../_panels/_primitives";
import { ActivityFeed, type ActivityRowInput } from "../_panels/activity-feed";
import { AppsShipped, TopAppsByRevenue } from "../_panels/apps-revenue";
import { BetsTable } from "../_panels/bets-table";
import { OutputLog } from "../_panels/output-log";
import { PositionsTable } from "../_panels/positions-table";
import type { App } from "../lib/apps";
import { SOL_APPS } from "../lib/apps";
import type { Bet } from "../lib/bets";
import { buildOutputLog } from "../lib/output-log";
import type { Position } from "../lib/positions";

export const metadata: Metadata = {
	title: "wave T - worker C preview",
};

export const dynamic = "force-static";

const NOW = Date.parse("2026-05-20T18:31:02Z");
const t = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

// ── Extended app catalogue for the preview ───────────────────────
// Foundation lib/apps.ts only ships the 2 real apps. The preview
// route extends that with the planned ones as honest "scheduled"
// rows so the panel shape is testable without faking revenue.

const PREVIEW_APPS: App[] = [
	...SOL_APPS,
	{
		id: "waifu-terminal",
		name: "Waifu Terminal",
		description: "this dashboard, contract-driven token surface",
		revenue30d: 0,
		change30d: 0,
		status: "scheduled",
	},
	{
		id: "alpha-signals",
		name: "Alpha Signals",
		description: "x + discord signal feed (planned)",
		revenue30d: 0,
		change30d: 0,
		status: "scheduled",
	},
	{
		id: "sol-sniper",
		name: "Sol Sniper",
		description: "bsc launch sniper (planned)",
		revenue30d: 0,
		change30d: 0,
		status: "scheduled",
	},
	{
		id: "trend-oracle",
		name: "Trend Oracle",
		description: "market trend agent (planned)",
		revenue30d: 0,
		change30d: 0,
		status: "scheduled",
	},
];

// ── Activity feed mock ───────────────────────────────────────────

const ACTIVITY: ActivityRowInput[] = [
	{
		id: "trade-1",
		type: "trade",
		timestamp: t(2),
		side: "buy",
		asset: "$SOL",
		amount: 18750.23,
		priceBnb: 0.010642,
		venue: "PancakeSwap",
		url: "https://bscscan.com/tx/0xabc",
	},
	{
		id: "app-1",
		type: "app",
		timestamp: t(6),
		action: "shipped",
		appName: "Sol Sniper",
		version: "v1.2.0",
		revenueUsd: 0,
		url: "https://github.com/waifufun/waifu/pull/640",
	},
	{
		id: "bet-1",
		type: "bet",
		timestamp: t(14),
		market: "polymarket",
		question: "Will BNB be above $650 on May 20?",
		result: "yes",
		pnlUsd: 2450,
		url: "https://polymarket.com",
	},
	{
		id: "pos-1",
		type: "position",
		timestamp: t(28),
		action: "open",
		market: "BTC-USD",
		venue: "Hyperliquid",
		leverage: 2.35,
		direction: "long",
		pnlUsd: 3842.21,
		url: "https://app.hyperliquid.xyz",
	},
	{
		id: "treasury-1",
		type: "treasury",
		timestamp: t(51),
		action: "deposit",
		from: "treasury",
		to: "Astherus Finance",
		amount: "50,000 USDC -> sUSDC",
		deltaUsd: 50000,
		url: "https://astherus.fi",
	},
	{
		id: "revenue-1",
		type: "revenue",
		timestamp: t(78),
		source: "tax",
		usd: 1246.72,
	},
	{
		id: "pr-638",
		type: "pr",
		timestamp: t(95),
		title: "swap four.meme references to FLAP across user surfaces",
		number: 638,
		url: "https://github.com/waifufun/waifu/pull/638",
	},
	{
		id: "tweet-1",
		type: "tweet",
		timestamp: t(135),
		text: "shipped 47 prs this week. mostly cleanup, one big rewrite of the dossier panel.",
		url: "https://x.com/waifudotfun/status/1",
		impressions: 12_400,
		likes: 218,
	},
];

const POSITIONS: Position[] = [
	{
		id: "bnb-spot",
		asset: "BNB",
		venue: "spot · bsc",
		valueUsd: 18.66,
		pnl24h: 0,
		pnl24hPct: 0,
		status: "live",
	},
];

const BETS: Bet[] = [];

export default function WaveTCPreviewPage() {
	// Synthesize a few minimal foundation ActivityItems so the
	// existing output-log builder still works.
	const outputItems = ACTIVITY.filter(
		(a) => a.type === "pr" || a.type === "tweet" || a.type === "tx" || a.type === "revenue",
	) as Parameters<typeof buildOutputLog>[0];
	const lines = buildOutputLog(outputItems, 8);

	return (
		<main
			className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto max-w-[1440px] px-5 py-6">
				<header className="mb-6">
					<h1 className="font-mono text-[14px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
						wave T · worker C panel preview (v2)
					</h1>
					<p className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">
						activity feed · apps shipped · top apps · positions · bets · output log
					</p>
				</header>

				{/* v2 layout: ActivityFeed dominates left 2/3, AppsShipped + TopApps stack on the right */}
				<div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
					<ActivityFeed rows={ACTIVITY} max={6} />
					<div className="flex flex-col gap-4">
						<AppsShipped apps={PREVIEW_APPS} visibleCount={3} />
						<TopAppsByRevenue apps={PREVIEW_APPS} limit={4} />
					</div>
				</div>

				{/* Auxiliary panels: positions / bets / output-log kept for orchestrator flexibility */}
				<div className="mt-4 grid gap-4 lg:grid-cols-2">
					<PositionsTable positions={POSITIONS} />
					<BetsTable bets={BETS} />
				</div>
				<div className="mt-4">
					<OutputLog lines={lines} />
				</div>
			</div>
		</main>
	);
}
