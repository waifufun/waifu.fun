"use client";

/**
 * Live launches rail. Shows currently-open rounds on the landing page.
 *
 * Quietly returns null when no rounds are open (or the API is unwired)
 * so the landing page remains clean for cold visitors. When rounds are
 * available, it shows up to 6 in a scrollable rail with a "see all" link.
 */
import Link from "next/link";

import { LaunchCard, LaunchCardSkeleton } from "@/components/launches-discover/launch-card";
import { useLaunchesList } from "@/lib/api/launches-list";

const RAIL_LIMIT = 6;

export function LiveLaunchesRail() {
	const { data, isLoading } = useLaunchesList({ state: "open", limit: RAIL_LIMIT });

	const launches = data?.launches ?? [];
	const hasAny = launches.length > 0;
	const showSkeleton = isLoading && !data;

	// quietly hide when there's nothing live and we're not loading.
	if (!showSkeleton && !hasAny) return null;

	return (
		<section className="relative z-20 w-full max-w-6xl mx-auto px-5 md:px-8 pt-12 scroll-mt-20">
			<div className="mb-5 flex items-end justify-between">
				<div>
					<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-2 flex items-center gap-2">
						<span className="w-1.5 h-1.5 rounded-full bg-[#00ff87] animate-pulse" />
						live now
					</div>
					<h2 className="text-2xl md:text-3xl leading-tight tracking-tight text-white">
						{showSkeleton ? "loading rounds…" : `${launches.length} round${launches.length === 1 ? "" : "s"} open`}
					</h2>
				</div>
				<Link
					href="/launches"
					className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-white/90 transition-colors"
				>
					see all
				</Link>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{showSkeleton
					? Array.from({ length: 3 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<LaunchCardSkeleton key={i} variant="compact" />
						))
					: launches
							.slice(0, RAIL_LIMIT)
							.map((launch) => <LaunchCard key={launch.id} launch={launch} variant="compact" />)}
			</div>
		</section>
	);
}

export default LiveLaunchesRail;
