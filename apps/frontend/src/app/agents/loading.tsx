import AgentCardSkeleton from "@/components/agents-discover/agent-card-skeleton";

export default function Loading() {
	return (
		<div className="min-h-screen bg-black text-white">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pt-10 pb-24">
				<div className="mb-8">
					<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#22c55e] mb-3">
						waifu.fun / agents
					</div>
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<h1 className="text-3xl md:text-4xl leading-tight tracking-tight">agents</h1>
						<div className="h-3 w-48 bg-white/5 rounded-sm" />
					</div>
				</div>
				<div className="h-12 border-y border-white/10" />
				<div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{Array.from({ length: 9 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<AgentCardSkeleton key={i} />
					))}
				</div>
			</div>
		</div>
	);
}
