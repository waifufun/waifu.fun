"use client";

import type { LeaderboardSort } from "@/lib/api/leaderboard";
import { cn } from "@/lib/utils";

const OPTIONS: { key: LeaderboardSort; label: string }[] = [
	{ key: "runway", label: "runway" },
	{ key: "treasury", label: "treasury" },
	{ key: "burn", label: "daily burn" },
];

type Props = {
	value: LeaderboardSort;
	onChange: (next: LeaderboardSort) => void;
};

export default function SortToggle({ value, onChange }: Props) {
	return (
		<div
			aria-label="Sort leaderboard"
			className="inline-flex items-center gap-1 p-1 rounded-md border border-white/5 bg-white/[0.02]"
		>
			{OPTIONS.map((opt) => {
				const active = value === opt.key;
				return (
					<button
						key={opt.key}
						type="button"
						onClick={() => onChange(opt.key)}
						aria-pressed={active}
						className={cn(
							"px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] rounded-sm transition-colors",
							active ? "bg-[#00ff87]/10 text-[#00ff87]" : "text-neutral-400 hover:text-white hover:bg-white/[0.04]",
						)}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
