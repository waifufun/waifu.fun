/**
 * AgentHomeV2. The premium wave-M+ agent surface.
 *
 * Page rhythm (top to bottom):
 *   1. slim back nav
 *   2. HERO          asymmetric poster + identity + addresses
 *   3. ECONOMICS     tier ladder + tax split bar
 *   4. TREASURY      treasuryLp / agentSafe / taxSplitter rows
 *   5. (legacy v3 surface, when graduated)  burn counter, claim,
 *                    tax stream, trade activity
 *   6. ACTIVITY      event feed (existing component)
 *   7. IDENTITY      description + system prompt reveal (when present)
 *
 * Each major section is its own SurfaceCard so the page reads as a
 * sequence of premium panels, not a sea of stat boxes. Macro-whitespace
 * between sections is `mt-12` so it breathes.
 *
 * Legacy / pre-wave-M agents still render: the economics + treasury
 * panels fall back to quiet 'not configured' placeholders so every
 * agent (including \$DEMO) shows the full v2 surface.
 */
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PostLaunchSurface } from "@/components/post-launch/post-launch-surface";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";

import ActivityFeed from "./activity-feed";
import AgentHeroV2, { type AgentLaunchHeroSlice } from "./agent-hero-v2";
import DexChart from "./dex-chart";
import EconomicsPanel from "./economics-panel";
import IdentityPanel from "./identity-panel";
import LiveLaunchBanner from "./live-launch-banner";
import RecentActivity from "./recent-activity";
import SwapStub from "./swap-stub";
import TreasuryPanelV2 from "./treasury-panel-v2";
import type { AgentData, AgentTrade } from "./types";

export default function AgentHomeV2({
	agent,
	trades,
	launch,
}: {
	agent: AgentData;
	trades: AgentTrade[];
	/**
	 * Pre-fetched wave-M launch row. Null when the token is legacy /
	 * pre-wave-M; the page still renders, just without economics +
	 * treasury chrome.
	 */
	launch: AgentLaunchByToken | null;
}) {
	const graduated = agent.status === "graduated";
	const heroSlice: AgentLaunchHeroSlice | null = launch
		? {
				tier: launch.tier ?? null,
				creator: launch.creator ?? null,
				agentSafe: launch.agentSafe ?? null,
			}
		: null;

	return (
		<main className="min-h-[100dvh] text-white">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pt-8 pb-24">
				<TopBar />

				<div className="mt-8">
					<AgentHeroV2 agent={agent} launch={heroSlice} />
				</div>

				{/* live launch banner sits above the economics if there's a
				    deposit window currently open or recently closed. */}
				<div className="mt-6">
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

				<Section title="chart" subtitle="dex price feed">
					<DexChart tokenAddress={agent.tokenAddress} graduated={graduated} />
				</Section>

				<Section title="trade" subtitle="swap on pancakeswap / bonding curve" id="trade">
					<SwapStub agent={agent} />
				</Section>

				<Section title="activity" subtitle="recent agent events">
					<ActivityFeed agentId={agent.tokenAddress} />
				</Section>

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
