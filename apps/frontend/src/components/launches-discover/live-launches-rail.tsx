"use client";

/**
 * Live launches rail. Shows currently-open rounds on the landing page.
 *
 * Quietly returns null when no rounds are open (or the API is unwired)
 * so the landing page remains clean for cold visitors. When rounds are
 * available, it shows up to 6 in a scrollable rail with a "see all" link.
 *
 * Loading UX:
 *  - The skeleton title is a shimmer block, not the words "loading rounds...",
 *    so a user who never sees rounds never sees that copy at all.
 *  - The skeleton is time-bound by SKELETON_TIMEOUT_MS; if the query has not
 *    produced data within that window we hide the rail entirely. This guards
 *    against silent hangs (CORS preflight stall, hung worker, etc.) where
 *    isLoading would otherwise stay true forever.
 *  - Errors hide the rail.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { LaunchCard, LaunchCardSkeleton } from "@/components/launches-discover/launch-card";
import { useLaunchesList } from "@/lib/api/launches-list";

const RAIL_LIMIT = 6;
const SKELETON_TIMEOUT_MS = 4000;

export function LiveLaunchesRail() {
	const { data, isLoading, isError } = useLaunchesList({ state: "open", limit: RAIL_LIMIT });

	const [skeletonExpired, setSkeletonExpired] = useState(false);
	useEffect(() => {
		if (data || isError) return;
		const t = setTimeout(() => setSkeletonExpired(true), SKELETON_TIMEOUT_MS);
		return () => clearTimeout(t);
	}, [data, isError]);

	const launches = data?.launches ?? [];
	const hasAny = launches.length > 0;
	const showSkeleton = isLoading && !data && !isError && !skeletonExpired;

	// hide on error or once we know there's nothing live.
	if (isError && !hasAny) return null;
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
						{showSkeleton ? (
							<span className="inline-block h-7 md:h-9 w-44 md:w-56 rounded bg-white/[0.06] animate-pulse align-middle" />
						) : launches.length === 1 ? (
							"1 round live"
						) : (
							`${launches.length} rounds live`
						)}
					</h2>
				</div>
				<Link
					href="/launches"
					className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-white/90 transition-colors duration-150"
				>
					browse all
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
