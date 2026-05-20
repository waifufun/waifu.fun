/**
 * Wave T · Worker C — screenshot preview route.
 *
 * Renders the 5 panels (activity, apps&revenue, positions, bets, output log)
 * against synthetic data so we can produce a PR screenshot before worker B
 * wires them into the real dashboard. Safe to keep around as a visual harness;
 * remove once the wired dashboard supersedes it.
 */

import type { Metadata } from "next";
import type * as React from "react";

import { THEME_TOKENS } from "../_panels/_primitives";
import { ActivityFeed } from "../_panels/activity-feed";
import { AppsRevenue } from "../_panels/apps-revenue";
import { BetsTable } from "../_panels/bets-table";
import { OutputLog } from "../_panels/output-log";
import { PositionsTable } from "../_panels/positions-table";
import type { ActivityItem } from "../lib/activity";
import { SOL_APPS, summarizeApps } from "../lib/apps";
import type { Bet } from "../lib/bets";
import { buildOutputLog } from "../lib/output-log";
import type { Position } from "../lib/positions";

export const metadata: Metadata = {
	title: "wave T · worker C preview",
};

export const dynamic = "force-static";

const NOW = Date.parse("2026-05-20T18:31:02Z");

const ACTIVITY: ActivityItem[] = [
	{
		id: "pr-638",
		type: "pr",
		timestamp: new Date(NOW - 2 * 60_000).toISOString(),
		title: "swap four.meme references to FLAP across user surfaces",
		number: 638,
		url: "https://github.com/waifufun/waifu/pull/638",
	},
	{
		id: "tweet-1",
		type: "tweet",
		timestamp: new Date(NOW - 14 * 60_000).toISOString(),
		text: "shipped 47 prs this week. mostly cleanup, one big rewrite of the dossier panel.",
		url: "https://x.com/waifudotfun/status/1",
		impressions: 12_400,
		likes: 218,
	},
	{
		id: "tx-1",
		type: "tx",
		timestamp: new Date(NOW - 28 * 60_000).toISOString(),
		method: "swapExactETHForTokens",
		valueBnb: 0.0418,
		url: "https://bscscan.com/tx/0xabc",
	},
	{
		id: "tx-2",
		type: "tx",
		timestamp: new Date(NOW - 51 * 60_000).toISOString(),
		method: "transfer",
		valueBnb: 0.012,
		url: "https://bscscan.com/tx/0xdef",
	},
	{
		id: "pr-637",
		type: "pr",
		timestamp: new Date(NOW - 95 * 60_000).toISOString(),
		title: "use $elizaos as placeholder token + real OHLC via pool",
		number: 637,
		url: "https://github.com/waifufun/waifu/pull/637",
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
	const summary = summarizeApps(SOL_APPS);
	const lines = buildOutputLog(ACTIVITY, 8);

	return (
		<main
			className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]"
			style={THEME_TOKENS as React.CSSProperties}
		>
			<div className="mx-auto max-w-[1380px] px-5 py-6">
				<header className="mb-6">
					<h1 className="font-mono text-[14px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">
						wave T · worker C panel preview
					</h1>
					<p className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">
						activity feed · apps & revenue · positions · bets · output log
					</p>
				</header>

				<div className="grid gap-4 lg:grid-cols-2">
					<ActivityFeed items={ACTIVITY} />
					<AppsRevenue
						apps={summary.apps}
						totalRevenue30d={summary.totalRevenue30d}
						totalChange30d={summary.totalChange30d}
					/>
					<PositionsTable positions={POSITIONS} />
					<BetsTable bets={BETS} />
					<div className="lg:col-span-2">
						<OutputLog lines={lines} />
					</div>
				</div>
			</div>
		</main>
	);
}
