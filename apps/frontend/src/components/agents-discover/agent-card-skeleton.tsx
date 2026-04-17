export default function AgentCardSkeleton() {
	return (
		<div className="flex flex-col border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			<div className="aspect-square w-full bg-white/[0.02] border-b border-white/5 relative overflow-hidden">
				<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
			</div>
			<div className="p-4 space-y-3">
				<div className="flex items-center gap-2">
					<div className="h-3 w-20 bg-white/10 rounded-sm" />
					<div className="h-4 w-12 bg-white/5 rounded-sm" />
				</div>
				<div className="space-y-1.5">
					<div className="h-2 w-full bg-white/5 rounded-sm" />
					<div className="h-2 w-2/3 bg-white/5 rounded-sm" />
				</div>
				<div className="flex items-center justify-between pt-2 border-t border-white/5">
					<div className="h-2 w-16 bg-white/5 rounded-sm" />
					<div className="h-2 w-10 bg-white/5 rounded-sm" />
				</div>
			</div>
		</div>
	);
}
