"use client";

/**
 * If this agent has a v3 launch in `open` or `closed` state, surface a
 * banner at the top of the agent page linking to /launch/[id]. Skips
 * rendering for `launched` and `failed` (and when no launch row exists).
 */
import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LaunchCountdown } from "@/components/launch-page/launch-countdown";
import { useLaunchByToken } from "@/hooks/use-post-launch";

type Props = {
	tokenAddress: string;
};

export function LiveLaunchBanner({ tokenAddress }: Props) {
	const launch = useLaunchByToken(tokenAddress);
	const data = launch.data;

	if (!data) return null;
	if (data.state !== "open" && data.state !== "closed") return null;

	const isOpen = data.state === "open";
	const closeTs = data.closeTimestamp ?? null;

	return (
		<Link
			href={`/launch/${encodeURIComponent(data.id)}`}
			className="group mt-6 flex items-center justify-between gap-4 border border-[#00ff87]/30 bg-[#00ff87]/[0.04] hover:bg-[#00ff87]/[0.07] hover:border-[#00ff87]/50 transition-colors px-5 py-4 rounded-sm"
		>
			<div className="flex items-center gap-3 min-w-0">
				<span className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-[#00ff87]/40 bg-[#00ff87]/10">
					<span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] animate-pulse" />
				</span>
				<div className="min-w-0">
					<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
						{isOpen ? "live launch round" : "round closed, awaiting bundle"}
					</div>
					<div className="mt-0.5 text-sm text-white/85 truncate">
						{isOpen ? "deposit BNB before the window closes" : "v2 graduation in progress"}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-3 shrink-0">
				{isOpen && closeTs ? (
					<LaunchCountdown
						closeTimestampSec={closeTs}
						compact
						className="font-mono text-sm tabular-nums text-[#00ff87]"
					/>
				) : null}
				<ArrowRight className="w-4 h-4 text-[#00ff87] transition-transform group-hover:translate-x-0.5" />
			</div>
		</Link>
	);
}

export default LiveLaunchBanner;
