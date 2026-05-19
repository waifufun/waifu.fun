/**
 * Skeleton tuned to the AgentCardV2 shape. Mirrors:
 *   - square framed hero with shimmer + badge slots
 *   - name + ticker line
 *   - hairline-divided 4-up stat row
 *   - state dot + truncated token address
 *
 * Real shape, no generic 3-line text shimmer.
 */
export default function AgentCardV2Skeleton() {
	return (
		<div className="flex flex-col overflow-hidden rounded-sm border border-white/10 bg-[#08080a]">
			{/* hero */}
			<div className="relative aspect-square w-full overflow-hidden border-b border-white/10 bg-white/[0.02]">
				<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
				<div className="absolute left-2.5 top-2.5 h-5 w-16 rounded-sm bg-white/[0.06]" />
				<div className="absolute right-2.5 top-2.5 h-5 w-16 rounded-sm bg-white/[0.06]" />
			</div>
			{/* body */}
			<div className="flex flex-col gap-3.5 p-4 pt-3.5">
				<div className="flex items-baseline gap-2">
					<div className="h-3.5 w-28 rounded-sm bg-white/10" />
					<div className="h-4 w-12 rounded-sm bg-white/[0.06]" />
				</div>
				{/* 4-up hairline stat row */}
				<div className="grid grid-cols-4 divide-x divide-white/[0.06]">
					{[0, 1, 2, 3].map((k) => (
						<div key={k} className="flex flex-col gap-1.5 px-2.5 py-0.5 first:pl-0 last:pr-0">
							<div className="h-1.5 w-7 rounded-sm bg-white/10" />
							<div className="h-3 w-10 rounded-sm bg-white/15" />
						</div>
					))}
				</div>
				<div className="mt-0.5 flex items-center justify-between border-t border-white/[0.06] pt-3">
					<div className="h-2 w-16 rounded-sm bg-white/[0.06]" />
					<div className="h-2 w-24 rounded-sm bg-white/[0.06]" />
				</div>
			</div>
		</div>
	);
}
