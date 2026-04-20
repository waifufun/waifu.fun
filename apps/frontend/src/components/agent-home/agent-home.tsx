import { cn, timeAgo } from "@/lib/utils";
import { ArrowLeft, Brain, ExternalLink, Fingerprint } from "lucide-react";
import Link from "next/link";
import AddressRow from "./address-row";
import AgentVoice from "./agent-voice";
import CurveProgress from "./curve-progress";
import DexChart from "./dex-chart";
import PatronPanel from "./patron-panel";
import RecentActivity from "./recent-activity";
import SwapStub from "./swap-stub";
import SystemPromptReveal from "./system-prompt-reveal";
import type { AgentData, AgentTrade } from "./types";

const EIP8004_CONTRACT = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

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
					<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30">agent home</div>
				</div>

				{/* 1. header */}
				<AgentHeader agent={agent} />

				{/* 2. patron */}
				<Section title="patron">
					<PatronPanel agent={{ tokenAddress: agent.tokenAddress, name: agent.name, ticker: agent.ticker }} />
				</Section>

				{/* 3. addresses */}
				<Section title="addresses">
					<div className="border border-white/10 bg-[#08080a] rounded-sm divide-y divide-white/10">
						{agent.walletAddress && <AddressRow label="wallet" address={agent.walletAddress} />}
						<AddressRow label="token" address={agent.tokenAddress} />
						{agent.treasuryAddress && agent.treasuryAddress !== agent.walletAddress && (
							<AddressRow label="treasury" address={agent.treasuryAddress} />
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

				{/* 4. curve progress */}
				<Section title={graduated ? "graduated" : "curve progress"}>
					<CurveProgress agent={agent} />
				</Section>

				{/* 4b. chart (only meaningful post-graduation, when pancake pair exists) */}
				<Section title="chart">
					<DexChart tokenAddress={agent.tokenAddress} graduated={graduated} />
				</Section>

				{/* 5. swap stub */}
				<Section title="trade">
					<SwapStub agent={agent} />
				</Section>

				{/* 6. recent activity */}
				<Section title="last 20 trades">
					<RecentActivity trades={trades} />
				</Section>

				{/* 7. agent output / work */}
				<Section title="output">
					<AgentVoice {...(agent.twitterHandle ? { twitterHandle: agent.twitterHandle } : {})} />
				</Section>

				{/* 8. system prompt */}
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
						<span className="inline-flex items-center h-6 px-2 rounded-sm text-[10px] font-mono tracking-wider text-[#22c55e] border border-[#22c55e]/30 bg-[#22c55e]/5">
							${agent.ticker}
						</span>
						<StatusBadge graduated={graduated} />
					</div>

					{agent.description && (
						<p className="text-xs md:text-sm text-white/55 leading-relaxed mt-2 line-clamp-3">{agent.description}</p>
					)}

					{/* runtime microcopy row — identity + brain + activity */}
					<div className="mt-3 flex items-center gap-3 flex-wrap text-[10px] font-mono uppercase tracking-[0.16em]">
						{agent.eip8004TokenId !== undefined && (
							<a
								href={`https://bscscan.com/token/${EIP8004_CONTRACT}?a=${agent.eip8004TokenId}`}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1.5 text-white/45 hover:text-[#22c55e] transition-colors"
								title="EIP-8004 onchain identity"
							>
								<Fingerprint className="w-3 h-3" strokeWidth={1.5} />
								EIP-8004 #{agent.eip8004TokenId}
							</a>
						)}
						<span className="inline-flex items-center gap-1.5 text-white/45">
							<Brain className="w-3 h-3" strokeWidth={1.5} />
							brain: {agent.framework || "ElizaOS"} + {agent.model || "Cloud"}
						</span>
						{agent.lastActionAt ? (
							<span className="inline-flex items-center gap-1.5 text-[#22c55e]">
								<span className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse" />
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

					{(agent.preset || (agent.traits && agent.traits.length > 0)) && (
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
				graduated ? "border border-white/20 text-white/60" : "border border-[#22c55e]/30 text-[#22c55e] bg-[#22c55e]/5",
			)}
		>
			<span className={cn("w-1.5 h-1.5 rounded-full", graduated ? "bg-white/40" : "bg-[#22c55e] animate-pulse")} />
			{graduated ? "graduated" : "active"}
		</span>
	);
}
