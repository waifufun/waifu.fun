import { PostLaunchSurface } from "@/components/post-launch/post-launch-surface";
import { cn, timeAgo } from "@/lib/utils";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import ActivityFeed from "./activity-feed";
import AdapterPermissions from "./adapter-permissions";
import AddressRow from "./address-row";
import CurveProgress from "./curve-progress";
import DexChart from "./dex-chart";
import LiveLaunchBanner from "./live-launch-banner";
import PatronPanel from "./patron-panel";
import RecentActivity from "./recent-activity";
import SwapStub from "./swap-stub";
import SystemPromptReveal from "./system-prompt-reveal";
import TreasuryCard from "./treasury-card";
import type { AgentData, AgentTrade } from "./types";
import XEmbed from "./x-embed";

// $DEMO is a curated showcase from the v1 / four.meme hackathon era: hide
// tooling (adapter permissions, the patron-only connect-x affordances) that
// doesn't apply to a static demo. The page also hides modern v3 chrome (tier
// ladder + post-launch surface) for legacy rows below.
const DEMO_TOKEN_ADDRESS = "0xc05dde3f113a57260f1839abd3b5a0eac1314444";

export default function AgentHome({
	agent,
	trades,
}: {
	agent: AgentData;
	trades: AgentTrade[];
}) {
	const graduated = agent.status === "graduated";
	const isDemo = agent.tokenAddress.toLowerCase() === DEMO_TOKEN_ADDRESS.toLowerCase();

	const agentId = agent.tokenAddress;
	const treasuryAddress = agent.treasuryAddress || agent.walletAddress || agent.tokenAddress;

	return (
		<div className="min-h-screen text-white">
			<div className="mx-auto w-full max-w-5xl px-5 md:px-8 pt-10 pb-24">
				<div className="mb-8 flex items-center justify-between">
					<Link
						href="/"
						className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white/70 transition-colors"
					>
						<ArrowLeft className="w-3 h-3" />
						waifu.fun
					</Link>
					<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30">agent home</div>
				</div>

				{/* 1. header */}
				<AgentHeader agent={agent} />

				{/* 1a. live launch round banner (only when this agent has an open/closed v3 round) */}
				<LiveLaunchBanner tokenAddress={agent.tokenAddress} />

				{/* 2. patron */}
				<Section title="patron">
					<PatronPanel agent={{ tokenAddress: agent.tokenAddress, name: agent.name, ticker: agent.ticker }} />
				</Section>

				{/* 3. v2 surface: treasury + adapters (left) · x + activity (right) */}
				<section className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
					<div className="flex flex-col gap-5 min-w-0">
						<SubSection title="treasury">
							<TreasuryCard treasuryAddress={treasuryAddress} agentId={agentId} ticker={agent.ticker} />
						</SubSection>
						{isDemo ? null : (
							<SubSection title="permissions">
								<AdapterPermissions agentId={agentId} />
							</SubSection>
						)}
					</div>
					<div className="flex flex-col gap-5 min-w-0">
						<SubSection title="voice">
							<XEmbed
								agentId={agentId}
								agentName={agent.name}
								{...(agent.twitterHandle ? { fallbackHandle: agent.twitterHandle } : {})}
							/>
						</SubSection>
						<SubSection title="activity">
							<ActivityFeed agentId={agentId} />
						</SubSection>
					</div>
				</section>

				{/* 4. addresses */}
				<Section title="addresses">
					<div className="border border-white/10 bg-[#08080a] rounded-sm divide-y divide-white/10">
						{agent.walletAddress && <AddressRow label="wallet" address={agent.walletAddress} />}
						<AddressRow label="token" address={agent.tokenAddress} />
						{agent.treasuryAddress && agent.treasuryAddress !== agent.walletAddress && (
							<AddressRow label="treasury" address={agent.treasuryAddress} />
						)}
					</div>
					<div className="mt-3 flex items-center gap-3">
						{agent.tradeUrl && (
							<a
								href={agent.tradeUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-white/60 hover:text-[#00ff87] transition-colors"
							>
								trade on pancakeswap
								<ExternalLink className="w-3 h-3" />
							</a>
						)}
						<a
							href={`https://bscscan.com/address/${agent.tokenAddress}`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-white/60 hover:text-[#00ff87] transition-colors"
						>
							bscscan
							<ExternalLink className="w-3 h-3" />
						</a>
					</div>
				</Section>

				{/* 4. curve progress */}
				<Section title={graduated ? "graduated" : "curve progress"}>
					<CurveProgress agent={agent} />
				</Section>

				{/* 4a. v3 post-launch surface (W50): tier ladder, burn counter,
				    claim widget, tax stream. Only renders for v3 launches that
				    have graduated; the surface returns null otherwise. */}
				{graduated && <PostLaunchSurface tokenAddress={agent.tokenAddress} ticker={agent.ticker} />}

				{/* 4b. chart (only meaningful post-graduation, when pancake pair exists) */}
				<Section title="chart">
					<DexChart tokenAddress={agent.tokenAddress} graduated={graduated} />
				</Section>

				{/* 5. swap stub */}
				<Section title="trade">
					<SwapStub agent={agent} />
				</Section>

				{/* 6. recent trades */}
				<Section title="last 20 trades">
					<RecentActivity trades={trades} />
				</Section>

				{/* 7. system prompt */}
				{agent.systemPrompt && (
					<Section title="brain">
						<SystemPromptReveal systemPrompt={agent.systemPrompt} />
					</Section>
				)}
			</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-10">
			<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30 mb-3">{title}</div>
			{children}
		</section>
	);
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30 mb-3">{title}</div>
			{children}
		</div>
	);
}

function AgentHeader({ agent }: { agent: AgentData }) {
	const graduated = agent.status === "graduated";
	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5 md:p-6">
			<div className="flex items-start gap-5">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={agent.image ?? "/brand/icon/icon_on_black_512.png"}
					alt={agent.name}
					className="w-20 h-20 md:w-24 md:h-24 shrink-0 object-cover rounded-sm border border-white/10 bg-black/40"
				/>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-lg md:text-xl tracking-tight truncate">{agent.name}</span>
						<span className="inline-flex items-center h-6 px-2 rounded-sm text-[10px] font-mono tracking-wider text-[#00ff87] border border-[#00ff87]/30 bg-[#00ff87]/5">
							${agent.ticker}
						</span>
						<StatusBadge graduated={graduated} />
					</div>

					{agent.description && (
						<p className="text-xs md:text-sm text-white/55 leading-relaxed mt-2 line-clamp-3">{agent.description}</p>
					)}

					{/* identity strip: token + activity. Wave M+ identity is the
					    on-chain token address + ticker; brain framework / model and
					    EIP-8004 chips were v1-era runtime metadata that no longer
					    matter to a buyer choosing a tier. */}
					<div className="mt-3 flex items-center gap-3 flex-wrap text-[10px] font-mono uppercase tracking-[0.16em]">
						<a
							href={`https://bscscan.com/address/${agent.tokenAddress}`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-white/45 hover:text-[#00ff87] transition-colors"
							title="token contract on BSC"
						>
							token: {`${agent.tokenAddress.slice(0, 6)}...${agent.tokenAddress.slice(-4)}`}
						</a>
						{agent.lastActionAt ? (
							<span className="inline-flex items-center gap-1.5 text-[#00ff87]">
								<span className="w-1 h-1 rounded-full bg-[#00ff87] animate-pulse" />
								last {agent.lastActionType || "action"}: {timeAgo(agent.lastActionAt)}
							</span>
						) : (
							!graduated && (
								<span className="inline-flex items-center gap-1.5 text-white/30">
									<span className="w-1 h-1 rounded-full bg-white/30" />
									warming up
								</span>
							)
						)}
					</div>

					{agent.traits && agent.traits.length > 0 && (
						<div className="mt-4 flex items-center gap-2 flex-wrap">
							{agent.traits.map((t) => (
								<span
									key={t}
									className="inline-flex items-center gap-1.5 h-6 px-2 rounded-sm text-[10px] font-mono text-white/55 border border-white/10"
								>
									<span className="w-1 h-1 rounded-full bg-white/30" />
									{t}
								</span>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function StatusBadge({ graduated }: { graduated: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 h-6 px-2 rounded-sm text-[10px] font-mono uppercase tracking-[0.16em]",
				graduated ? "border border-white/20 text-white/60" : "border border-[#00ff87]/30 text-[#00ff87] bg-[#00ff87]/5",
			)}
		>
			<span className={cn("w-1.5 h-1.5 rounded-full", graduated ? "bg-white/40" : "bg-[#00ff87] animate-pulse")} />
			{graduated ? "graduated" : "active"}
		</span>
	);
}
