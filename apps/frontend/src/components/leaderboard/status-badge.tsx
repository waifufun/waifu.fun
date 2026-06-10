"use client";

import { useTranslation } from "@/contexts/locale-context";
import type { LeaderboardStatus } from "@/lib/api/leaderboard";
import { cn } from "@/lib/utils";

const STYLES: Record<LeaderboardStatus, string> = {
	active: "bg-green-500/10 text-green-400 border-green-500/30",
	dormant: "bg-amber-500/10 text-amber-400 border-amber-500/30",
	killed: "bg-red-500/10 text-red-400 border-red-500/30",
	graduated: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

const DOTS: Record<LeaderboardStatus, string> = {
	active: "bg-green-400",
	dormant: "bg-amber-400",
	killed: "bg-red-400",
	graduated: "bg-blue-400",
};

export default function StatusBadge({ status }: { status: LeaderboardStatus }) {
	const { t } = useTranslation();
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border uppercase tracking-wide",
				STYLES[status] ?? STYLES.dormant,
			)}
		>
			<span className={cn("w-1.5 h-1.5 rounded-full", DOTS[status] ?? DOTS.dormant)} aria-hidden />
			{t(`leaderboard.badgeStatus.${status}`)}
		</span>
	);
}
