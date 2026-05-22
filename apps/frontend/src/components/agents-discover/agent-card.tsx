import { SurfaceCard } from "@/components/ui/surface-card";
import { resolveImageUrlOr } from "@/lib/image-url";
import { timeAgo } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { AgentListItem } from "./types";

function shortAddress(addr: string): string {
	if (!addr || addr.length < 11) return addr || "";
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AgentCard({ agent }: { agent: AgentListItem }) {
	const graduated = agent.status === "graduated";
	const pending = agent.status === "pending";

	return (
		<SurfaceCard variant="interactive" padding="none" asChild className="overflow-hidden">
			<Link href={`/agent/${agent.tokenAddress}`}>
				{/* image */}
				<div className="relative aspect-square w-full bg-black/40 border-b border-white/10 overflow-hidden">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={resolveImageUrlOr(agent.image, "/brand/icon/icon_on_black_512.png")}
						alt={`${agent.name} logo`}
						loading="lazy"
						className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
					/>

					{/* top-right status pill */}
					<div className="absolute top-2 right-2">
						<StatusBadge status={agent.status} />
					</div>
				</div>

				{/* body */}
				<div className="flex flex-col gap-2 p-4">
					<div className="flex items-baseline gap-2 min-w-0">
						<span className="text-sm text-white truncate">{agent.name}</span>
						<span className="inline-flex items-center h-5 px-1.5 rounded-sm text-[10px] font-mono tracking-wider text-[#00ff87] border border-[#00ff87]/30 bg-[#00ff87]/5 shrink-0">
							${agent.ticker}
						</span>
					</div>

					<p className="text-[11px] leading-relaxed text-white/50 line-clamp-2 min-h-[2.2rem]">
						{agent.description || "no description."}
					</p>

					{/* identity strip: short token address + last activity. Replaces
					    the v1 brain/framework chip which exposed implementation
					    detail no buyer cares about. */}
					<div className="flex items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-[0.14em] text-white/30">
						<span className="inline-flex items-center gap-1 min-w-0 truncate" title={agent.tokenAddress}>
							<span className="truncate">{shortAddress(agent.tokenAddress)}</span>
						</span>
						{agent.lastActionAt ? (
							<span className="inline-flex items-center gap-1 shrink-0">
								<span className="w-1 h-1 rounded-full bg-[#00ff87] animate-pulse" />
								<span>
									{agent.lastActionType || "action"} {timeAgo(agent.lastActionAt)}
								</span>
							</span>
						) : (
							<span className="text-white/20">warming up</span>
						)}
					</div>

					<div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10">
						<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/30">
							{pending ? "pending" : graduated ? "on pancakeswap" : "on curve"}
						</div>
						<div className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 group-hover:text-[#00ff87] transition-colors">
							view
							<ArrowUpRight
								className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
								strokeWidth={1.75}
							/>
						</div>
					</div>
				</div>
			</Link>
		</SurfaceCard>
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
		<span className="inline-flex items-center gap-1.5 h-5 px-1.5 rounded-sm text-[9px] font-mono uppercase tracking-[0.16em] bg-black/70 backdrop-blur-sm border border-[#00ff87]/40 text-[#00ff87]">
			<span className="w-1 h-1 rounded-full bg-[#00ff87] animate-pulse" />
			active
		</span>
	);
}
