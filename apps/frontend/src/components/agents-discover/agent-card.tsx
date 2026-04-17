import { cn } from "@/lib/utils";
import { ArrowUpRight, ImageOff } from "lucide-react";
import Link from "next/link";
import type { AgentListItem } from "./types";

export default function AgentCard({ agent }: { agent: AgentListItem }) {
	const graduated = agent.status === "graduated";
	const pending = agent.status === "pending";

	return (
		<Link
			href={`/agent/${agent.tokenAddress}`}
			className={cn(
				"group relative flex flex-col border border-white/10 bg-[#08080a] rounded-sm overflow-hidden",
				"transition-colors duration-200 hover:border-[#22c55e]/40",
			)}
		>
			{/* image */}
			<div className="relative aspect-square w-full bg-black/40 border-b border-white/5 overflow-hidden">
				{agent.image ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={agent.image}
						alt={agent.name}
						loading="lazy"
						className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center text-white/15">
						<ImageOff className="w-6 h-6" strokeWidth={1.5} />
					</div>
				)}

				{/* top-right status pill */}
				<div className="absolute top-2 right-2">
					<StatusBadge status={agent.status} />
				</div>
			</div>

			{/* body */}
			<div className="flex flex-col gap-2 p-4">
				<div className="flex items-baseline gap-2 min-w-0">
					<span className="text-sm text-white truncate">{agent.name}</span>
					<span className="inline-flex items-center h-5 px-1.5 rounded-sm text-[10px] font-mono tracking-wider text-[#22c55e] border border-[#22c55e]/30 bg-[#22c55e]/5 shrink-0">
						${agent.ticker}
					</span>
				</div>

				<p className="text-[11px] leading-relaxed text-white/50 line-clamp-2 min-h-[2.2rem]">
					{agent.description || "no description."}
				</p>

				<div className="flex items-center justify-between pt-2 mt-1 border-t border-white/5">
					<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/30">
						{pending ? "pending" : graduated ? "on pancakeswap" : "on curve"}
					</div>
					<div className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 group-hover:text-[#22c55e] transition-colors">
						view
						<ArrowUpRight
							className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
							strokeWidth={1.75}
						/>
					</div>
				</div>
			</div>
		</Link>
	);
}

function StatusBadge({ status }: { status: AgentListItem["status"] }) {
	if (status === "graduated") {
		return (
			<span className="inline-flex items-center gap-1.5 h-5 px-1.5 rounded-sm text-[9px] font-mono uppercase tracking-[0.16em] bg-black/70 backdrop-blur-sm border border-white/20 text-white/70">
				<span className="w-1 h-1 rounded-full bg-white/50" />
				graduated
			</span>
		);
	}
	if (status === "pending") {
		return (
			<span className="inline-flex items-center gap-1.5 h-5 px-1.5 rounded-sm text-[9px] font-mono uppercase tracking-[0.16em] bg-black/70 backdrop-blur-sm border border-white/15 text-white/40">
				<span className="w-1 h-1 rounded-full bg-white/30" />
				pending
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1.5 h-5 px-1.5 rounded-sm text-[9px] font-mono uppercase tracking-[0.16em] bg-black/70 backdrop-blur-sm border border-[#22c55e]/40 text-[#22c55e]">
			<span className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse" />
			active
		</span>
	);
}
