"use client";

import type { LeaderboardSort } from "@/lib/api/leaderboard";
import { cn } from "@/lib/utils";

const OPTIONS: { key: LeaderboardSort; label: string }[] = [
	{ key: "runway", label: "runway" },
	{ key: "treasury", label: "treasury" },
	{ key: "burn", label: "burn" },
];

type Props = {
	value: LeaderboardSort;
	onChange: (next: LeaderboardSort) => void;
};

// Wave T sort pills. Active uses `--accent-soft` bg + accent text, inactive
// is transparent with the soft border. Matches the StatPill grammar from
// `wave-t/_primitives.tsx` but rendered as buttons so it stays interactive.
export default function SortToggle({ value, onChange }: Props) {
	return (
		<div
			aria-label="sort leaderboard"
			className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em]"
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
							"inline-flex items-center rounded-full border px-2.5 py-1 transition-colors",
							active
								? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
								: "border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-mid)] hover:text-[var(--text-primary)]",
						)}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
