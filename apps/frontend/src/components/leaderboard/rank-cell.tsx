"use client";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";

const ACCENTS: Record<number, string> = {
	1: "decoration-[#ffd36b] text-[#ffd36b]",
	2: "decoration-[#c7c7c7] text-[#e4e4e7]",
	3: "decoration-[#d59366] text-[#e4a27a]",
};

export default function RankCell({ rank }: { rank: number }) {
	const { t } = useTranslation();
	const accent = ACCENTS[rank];
	return (
		<span
			className={cn(
				"font-mono tabular-nums text-sm inline-block",
				accent ? `${accent} underline decoration-2 underline-offset-4` : "text-neutral-400",
			)}
			aria-label={t("leaderboard.rankAria", { rank: String(rank) })}
		>
			{rank}.
		</span>
	);
}
