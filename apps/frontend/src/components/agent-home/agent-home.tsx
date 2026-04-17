import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentData, AgentTrade } from "./types";
import AddressRow from "./address-row";
import CurveProgress from "./curve-progress";
import SwapStub from "./swap-stub";
import RecentActivity from "./recent-activity";
import AgentVoice from "./agent-voice";
import SystemPromptReveal from "./system-prompt-reveal";

export default function AgentHome({
	agent,
	trades,
}: {
	agent: AgentData;
	trades: AgentTrade[];
}) {
	const graduated = agent.status === "graduated";

	return (
		<div className="min-h-screen bg-black text-white">
			<div className="mx-auto w-full max-w-3xl px-5 md:px-8 pt-10 pb-24">
				<div className="mb-8 flex items-center justify-between">
					<Link
						href="/"
						className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white/70 transition-colors"
					>
						<ArrowLeft className="w-3 h-3" />
						waifu.fun
					</Link>
					<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30">
						agent home
					</div>
				</div>

				{/* 1. header */}
				<AgentHeader agent={agent} />

				{/* 2. addresses */}
				<Section title="addresses">
					<div className="border border-white/10 bg-[#08080a] rounded-sm divide-y divide-white/10">
						{agent.walletAddress && (
							<AddressRow label="wallet" address={agent.walletAddress} />
						)}
						<AddressRow label="token" address={agent.tokenAddress} />
						{agent.treasuryAddress &&
							agent.treasuryAddress !== agent.walletAddress && (
								<AddressRow
									label="treasury"
									address={agent.treasuryAddress}
								/>
							)}
					</div>
					<div className="mt-3 flex items-center gap-3">
						{agent.fourMemeUrl && (
							<a
								href={agent.fourMemeUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-white/60 hover:text-[#22c55e] transition-colors"
							>
								open on four.meme
								<ExternalLink className="w-3 h-3" />
							</a>
						)}
						<a
							href={`https://bscscan.com/address/${agent.tokenAddress}`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-white/60 hover:text-[#22c55e] transition-colors"
						>
							bscscan
							<ExternalLink className="w-3 h-3" />
						</a>
					</div>
				</Section>

				{/* 3. curve progress */}
				<Section title={graduated ? "graduated" : "curve progress"}>
					<CurveProgress agent={agent} />
				</Section>

				{/* 4. swap stub */}
				<Section title="trade">
					<SwapStub agent={agent} />
				</Section>

				{/* 5. recent activity */}
				<Section title="last 20 trades">
					<RecentActivity trades={trades} />
				</Section>

				{/* 6. agent's voice */}
				<Section title="agent's voice">
					<AgentVoice
						{...(agent.twitterHandle
							? { twitterHandle: agent.twitterHandle }
							: {})}
					/>
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
			<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30 mb-3">
				{title}
			</div>
			{children}
		</section>
	);
}

function AgentHeader({ agent }: { agent: AgentData }) {
	const graduated = agent.status === "graduated";
	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5 md:p-6">
			<div className="flex items-start gap-5">
				{agent.image ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={agent.image}
						alt={agent.name}
						className="w-20 h-20 md:w-24 md:h-24 shrink-0 object-cover rounded-sm border border-white/10"
					/>
				) : (
					<div className="w-20 h-20 md:w-24 md:h-24 shrink-0 rounded-sm border border-white/10 bg-black/40 flex items-center justify-center text-white/20 text-xs font-mono">
						no image
					</div>
				)}

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-lg md:text-xl tracking-tight truncate">
							{agent.name}
						</span>
						<span className="inline-flex items-center h-6 px-2 rounded-sm text-[10px] font-mono tracking-wider text-[#22c55e] border border-[#22c55e]/30 bg-[#22c55e]/5">
							${agent.ticker}
						</span>
						<StatusBadge graduated={graduated} />
					</div>

					{agent.description && (
						<p className="text-xs md:text-sm text-white/55 leading-relaxed mt-2 line-clamp-3">
							{agent.description}
						</p>
					)}

					{(agent.preset ||
						(agent.traits && agent.traits.length > 0)) && (
						<div className="mt-4 flex items-center gap-2 flex-wrap">
							{agent.preset && (
								<span className="inline-flex items-center h-6 px-2 rounded-sm text-[10px] font-mono uppercase tracking-[0.16em] text-white/70 border border-white/15">
									{agent.preset}
								</span>
							)}
							{agent.traits?.map((t) => (
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
				graduated
					? "border border-white/20 text-white/60"
					: "border border-[#22c55e]/30 text-[#22c55e] bg-[#22c55e]/5",
			)}
		>
			<span
				className={cn(
					"w-1.5 h-1.5 rounded-full",
					graduated ? "bg-white/40" : "bg-[#22c55e] animate-pulse",
				)}
			/>
			{graduated ? "graduated" : "active"}
		</span>
	);
}
