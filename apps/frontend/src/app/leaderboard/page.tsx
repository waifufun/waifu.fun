"use client";

import LeaderboardTable from "@/components/leaderboard/leaderboard-table";
import { useLeaderboard } from "@/lib/api/leaderboard";

export default function LeaderboardPage() {
	const { data, isLoading, error } = useLeaderboard("runway", 50);

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

			{isLoading ? (
				<p className="text-sm text-neutral-500 font-mono">loading…</p>
			) : error ? (
				<div role="alert" className="p-6 rounded-md border border-red-500/30 bg-red-500/5 text-sm text-red-300">
					Couldn't load the leaderboard. {(error as Error).message}
				</div>
			) : !data || data.length === 0 ? (
				<p className="text-sm text-neutral-400">
					No agents launched yet —{" "}
					<a className="text-[#00ff87] hover:underline" href="/create">
						be the first
					</a>
					.
				</p>
			) : (
				<LeaderboardTable entries={data} />
			)}
		</main>
	);
}
