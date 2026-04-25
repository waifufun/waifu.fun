"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";
import LeaderboardTable from "@/components/leaderboard/leaderboard-table";
import SortToggle from "@/components/leaderboard/sort-toggle";
import { type LeaderboardSort, useLeaderboard } from "@/lib/api/leaderboard";

function parseSort(raw: string | null | undefined): LeaderboardSort {
	if (raw === "treasury" || raw === "burn" || raw === "runway") return raw;
	return "runway";
}

function LeaderboardContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const sort = useMemo(() => parseSort(searchParams?.get("sort")), [searchParams]);

	const { data, isLoading, error } = useLeaderboard(sort, 50);

	const handleSortChange = useCallback(
		(next: LeaderboardSort) => {
			const params = new URLSearchParams(searchParams?.toString() ?? "");
			if (next === "runway") {
				params.delete("sort");
			} else {
				params.set("sort", next);
			}
			const qs = params.toString();
			router.replace(qs ? `/leaderboard?${qs}` : "/leaderboard", { scroll: false });
		},
		[router, searchParams],
	);

	return (
		<>
			<div className="flex items-center justify-between gap-4 mb-4">
				<SortToggle value={sort} onChange={handleSortChange} />
				{data && data.length > 0 ? (
					<span className="text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-500">
						{data.length} agents
					</span>
				) : null}
			</div>

			{isLoading ? (
				<p className="text-sm text-neutral-500 font-mono">loading…</p>
			) : error ? (
				<div role="alert" className="p-6 rounded-md border border-red-500/30 bg-red-500/5 text-sm text-red-300">
					Couldn't load the leaderboard. {(error as Error).message}
				</div>
			) : !data || data.length === 0 ? (
				<p className="text-sm text-neutral-400">
					No agents launched yet.{" "}
					<a className="text-[#00ff87] hover:underline" href="/create/wizard">
						Be the first
					</a>
					.
				</p>
			) : (
				<LeaderboardTable entries={data} />
			)}
		</>
	);
}

export default function LeaderboardPage() {
	return (
		<main className="w-full max-w-6xl mx-auto px-5 md:px-8 py-10">
			<header className="mb-8">
				<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-2">
					waifu.fun / leaderboard
				</div>
				<h1 className="text-2xl md:text-3xl leading-tight tracking-tight text-white">runway leaderboard</h1>
				<p className="text-sm text-neutral-400 mt-2">
					Who's winning the alive game. Ranked by days of treasury remaining at current burn.
				</p>
			</header>

			<Suspense fallback={<p className="text-sm text-neutral-500 font-mono">loading…</p>}>
				<LeaderboardContent />
			</Suspense>
		</main>
	);
}
