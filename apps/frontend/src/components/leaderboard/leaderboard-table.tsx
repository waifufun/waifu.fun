"use client";

import { Hairline, StatPill } from "@/components/agent-home/wave-t/_primitives";
import {
	type LeaderboardEntry,
	type LeaderboardStatus,
	formatDaysAlive,
	formatRunway,
	formatUsdCompact,
} from "@/lib/api/leaderboard";
import { resolveImageUrl } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
	entries: LeaderboardEntry[];
};

function hrefFor(entry: LeaderboardEntry): string {
	return `/agent/${encodeURIComponent(entry.id)}`;
}

// Wave T avatar: 24px rounded square, soft border, mono fallback letter.
// Matches the avatar grammar used by other agent rows in the app.
function AgentAvatar({ entry }: { entry: LeaderboardEntry }) {
	const avatarUrl = resolveImageUrl(entry.avatar);
	return (
		<span className="block h-6 w-6 shrink-0 overflow-hidden rounded-sm border border-[var(--border-soft)] bg-[var(--bg-panel-hi)]">
			{avatarUrl ? (
				<Image
					alt={`${entry.ticker || "agent"} avatar`}
					className="h-full w-full object-cover"
					height={24}
					src={avatarUrl}
					unoptimized
					width={24}
				/>
			) : (
				<span className="flex h-full w-full items-center justify-center font-mono text-[10px] text-[var(--text-tertiary)]">
					{entry.ticker?.[0] ?? "?"}
				</span>
			)}
		</span>
	);
}

const STATUS_TONE: Record<LeaderboardStatus, "accent" | "neutral" | "negative" | "positive"> = {
	active: "accent",
	dormant: "neutral",
	killed: "negative",
	graduated: "positive",
};

function StatusTag({ status }: { status: LeaderboardStatus }) {
	return <StatPill tone={STATUS_TONE[status]}>{status}</StatPill>;
}

// Runway colorway: accent green when burn is healthy, neutral when no burn
// data (infinite/zero), negative red when under 7 days. Treasury and burn
// stay text-primary mono. They're facts, not warnings.
function runwayClass(entry: LeaderboardEntry): string {
	if (!Number.isFinite(entry.runwayDays)) return "text-[var(--text-tertiary)]";
	if (entry.dailyBurnUsd > 0 && entry.runwayDays < 7) return "text-[var(--negative)]";
	return "text-[var(--accent)]";
}

function Row({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
	const router = useRouter();
	const href = hrefFor(entry);

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: anchor inside row handles keyboard via Link
		<tr
			className="group cursor-pointer transition-all duration-150 hover:bg-[var(--bg-panel-hi)]"
			onClick={() => router.push(href)}
		>
			<td className="py-2.5 pl-4 pr-2 align-middle">
				<span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
					{String(rank).padStart(2, "0")}
				</span>
			</td>
			<td className="py-2.5 pr-2 align-middle">
				<Link
					className="flex min-w-0 items-center gap-2.5 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 group-hover:-translate-y-px transition-transform duration-150"
					href={href}
					onClick={(e) => e.stopPropagation()}
				>
					<AgentAvatar entry={entry} />
					<span className="flex min-w-0 items-baseline gap-2">
						{entry.ticker ? (
							<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-primary)]">
								{entry.ticker}
							</span>
						) : null}
						<span className="truncate text-[12px] text-[var(--text-secondary)]">{entry.name}</span>
					</span>
				</Link>
			</td>
			<td className="py-2.5 pr-2 text-right align-middle font-mono text-[12px] tabular-nums text-[var(--text-primary)]">
				{formatUsdCompact(entry.treasuryUsd)}
			</td>
			<td className="hidden py-2.5 pr-2 text-right align-middle font-mono text-[12px] tabular-nums text-[var(--text-secondary)] lg:table-cell">
				{formatUsdCompact(entry.dailyBurnUsd)}/d
			</td>
			<td className={cn("py-2.5 pr-2 text-right align-middle font-mono text-[12px] tabular-nums", runwayClass(entry))}>
				{formatRunway(entry.runwayDays)}
			</td>
			<td className="hidden py-2.5 pr-2 align-middle md:table-cell">
				<StatusTag status={entry.status} />
			</td>
			<td className="hidden py-2.5 pr-4 text-right align-middle font-mono text-[12px] tabular-nums text-[var(--text-tertiary)] xl:table-cell">
				{formatDaysAlive(entry.daysAlive)}
			</td>
		</tr>
	);
}

function MobileRow({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
	return (
		<Link
			className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-panel-hi)]"
			href={hrefFor(entry)}
		>
			<span className="w-7 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
				{String(rank).padStart(2, "0")}
			</span>
			<AgentAvatar entry={entry} />
			<span className="flex min-w-0 flex-1 flex-col">
				{entry.ticker ? (
					<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-primary)]">
						{entry.ticker}
					</span>
				) : null}
				<span className="truncate text-[11px] text-[var(--text-secondary)]">{entry.name}</span>
			</span>
			<span className="flex flex-col items-end gap-0.5">
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">runway</span>
				<span className={cn("font-mono text-[12px] tabular-nums", runwayClass(entry))}>
					{formatRunway(entry.runwayDays)}
				</span>
			</span>
		</Link>
	);
}

export default function LeaderboardTable({ entries }: Props) {
	return (
		<>
			{/* desktop / tablet: dense table, hairlines instead of stripes */}
			<div className="hidden md:block">
				<table className="w-full border-separate border-spacing-0">
					<caption className="sr-only">agents ranked by runway, treasury, and daily burn.</caption>
					<thead>
						<tr className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
							<th className="w-10 py-2.5 pl-4 pr-2 text-left font-normal" scope="col">
								#
							</th>
							<th className="py-2.5 pr-2 text-left font-normal" scope="col">
								agent
							</th>
							<th className="py-2.5 pr-2 text-right font-normal" scope="col">
								treasury
							</th>
							<th className="hidden py-2.5 pr-2 text-right font-normal lg:table-cell" scope="col">
								burn
							</th>
							<th className="py-2.5 pr-2 text-right font-normal" scope="col">
								runway
							</th>
							<th className="hidden py-2.5 pr-2 text-left font-normal md:table-cell" scope="col">
								status
							</th>
							<th className="hidden py-2.5 pr-4 text-right font-normal xl:table-cell" scope="col">
								alive
							</th>
						</tr>
						<tr aria-hidden>
							<td colSpan={7} className="p-0">
								<Hairline />
							</td>
						</tr>
					</thead>
					<tbody className="[&_tr+tr_td]:border-t [&_tr+tr_td]:border-[var(--border-soft)]">
						{entries.map((entry, idx) => (
							<Row entry={entry} key={entry.id || `${entry.name}-${idx}`} rank={idx + 1} />
						))}
					</tbody>
				</table>
			</div>

			{/* mobile: hairline-separated rows, ticker + name stacked, only runway right */}
			<ul className="flex flex-col md:hidden">
				{entries.map((entry, idx) => (
					<li
						className={cn("border-[var(--border-soft)]", idx > 0 && "border-t")}
						key={entry.id || `${entry.name}-${idx}`}
					>
						<MobileRow entry={entry} rank={idx + 1} />
					</li>
				))}
			</ul>
		</>
	);
}
