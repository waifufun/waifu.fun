"use client";

import { useTranslation } from "@/contexts/locale-context";
import { formatRunway, useLeaderboard } from "@/lib/api/leaderboard";
import Link from "next/link";
import RankCell from "./rank-cell";

export default function TopFiveWidget() {
	const { t } = useTranslation();
	const { data, isLoading, error } = useLeaderboard("runway", 5);

	if (isLoading || error || !data || data.length === 0) {
		return null;
	}

	const top = data.slice(0, 5);

	return (
		<section aria-labelledby="top-five-heading" className="relative z-20 w-full max-w-6xl mx-auto px-5 md:px-8 pt-8">
			<div className="rounded-md border border-white/5 bg-white/[0.02] p-5">
				<div className="flex items-end justify-between gap-4 mb-4">
					<div>
						<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-1">
							{t("leaderboard.topFive.eyebrow")}
						</div>
						<h2 id="top-five-heading" className="text-lg text-white tracking-tight">
							{t("leaderboard.topFive.title")}
						</h2>
					</div>
					<Link
						href="/leaderboard"
						className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-white/90 transition-colors"
					>
						{t("leaderboard.topFive.viewAll")} →
					</Link>
				</div>
				<ol className="flex flex-col gap-1">
					{top.map((entry, idx) => (
						<li key={entry.id || `${entry.name}-${idx}`}>
							<Link
								href={`/agent/${encodeURIComponent(entry.id)}`}
								className="flex items-center gap-3 py-2 px-2 rounded-sm hover:bg-white/[0.03] transition-colors"
							>
								<RankCell rank={idx + 1} />
								<span className="flex-1 min-w-0 flex items-baseline gap-2">
									<span className="text-white truncate">{entry.name}</span>
									{entry.ticker ? (
										<span className="text-[11px] text-neutral-500 font-mono truncate">${entry.ticker}</span>
									) : null}
								</span>
								<span className="text-[#00ff87] font-mono tabular-nums text-sm">{formatRunway(entry.runwayDays)}</span>
							</Link>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
