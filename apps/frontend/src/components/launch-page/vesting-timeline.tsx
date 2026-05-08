"use client";

type Props = {
	vestingEnabled: boolean;
};

/**
 * Visual mirror of `LaunchVault` vesting math:
 *   - vestingEnabled=false: 100% unlock at TGE.
 *   - vestingEnabled=true:  50% TGE + 50% linear over 24h.
 */
export function VestingTimeline({ vestingEnabled }: Props) {
	if (!vestingEnabled) {
		return (
			<div className="border border-white/10 bg-[#111114] p-4 text-sm text-zinc-300">
				<div className="mb-1 font-medium text-zinc-100">100% at launch</div>
				<div className="text-xs text-zinc-500">
					all presale tokens unlock the moment the round closes and trading opens.
				</div>
			</div>
		);
	}
	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 gap-2 text-sm">
				<div className="border border-white/10 bg-[#111114] p-3">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">tge</div>
					<div className="mt-1 text-zinc-100">50% unlocked</div>
				</div>
				<div className="border border-white/10 bg-[#111114] p-3">
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">+24h</div>
					<div className="mt-1 text-zinc-100">100% unlocked</div>
				</div>
			</div>
			<div className="relative h-2 w-full border border-white/10 bg-[#111114]">
				<div className="absolute left-0 top-0 h-full w-1/2 bg-[#00ff87]/70" />
				<div className="absolute left-1/2 top-0 h-full w-1/2 bg-gradient-to-r from-[#00ff87]/70 to-[#00ff87]/20" />
			</div>
			<p className="text-xs text-zinc-500">
				50% claimable at tge, the remaining 50% vests linearly over the first 24h post-launch.
			</p>
		</div>
	);
}
