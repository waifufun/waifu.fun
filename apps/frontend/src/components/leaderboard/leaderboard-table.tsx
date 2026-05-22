"use client";

import { type LeaderboardEntry, formatRunway, formatUsdExact } from "@/lib/api/leaderboard";
import { resolveImageUrl } from "@/lib/image-url";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RankCell from "./rank-cell";
import StatusBadge from "./status-badge";

type Props = {
	entries: LeaderboardEntry[];
};

function hrefFor(entry: LeaderboardEntry): string {
	return `/agent/${encodeURIComponent(entry.id)}`;
}

function AgentAvatar({ entry }: { entry: LeaderboardEntry }) {
	const avatarUrl = resolveImageUrl(entry.avatar);
	return (
		<span className="w-6 h-6 rounded-sm overflow-hidden bg-[#141414] shrink-0 border border-white/10 block">
			{avatarUrl ? (
				<Image
					src={avatarUrl}
					alt={`${entry.ticker ?? "agent"} avatar`}
					width={24}
					height={24}
					className="object-cover w-full h-full"
					unoptimized
				/>
			) : (
				<span className="w-full h-full flex items-center justify-center text-[10px] text-neutral-500">
					{entry.ticker?.[0] ?? "?"}
				</span>
			)}
		</span>
	);
}

function runwayColor(entry: LeaderboardEntry): string {
	if (entry.dailyBurnUsd > 0 && entry.runwayDays < 7) return "text-neutral-400";
	return "text-[#00ff87]";
}

export default function LeaderboardTable({ entries }: Props) {
	const router = useRouter();

	return (
		<>
			{/* Desktop / tablet table */}
			<div className="hidden md:block overflow-x-auto rounded-md border border-white/5">
				<table className="w-full text-sm">
					<caption className="sr-only">Agents ranked by runway, treasury, and daily burn.</caption>
					<thead>
						<tr className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
							<th scope="col" className="text-left px-4 py-3 font-normal w-12">
								#
							</th>
							<th scope="col" className="text-left px-4 py-3 font-normal">
								Agent
							</th>
							<th scope="col" className="text-right px-4 py-3 font-normal">
								treasury
							</th>
							<th scope="col" className="text-right px-4 py-3 font-normal">
								daily burn
							</th>
							<th scope="col" className="text-right px-4 py-3 font-normal">
								runway
							</th>
							<th scope="col" className="text-left px-4 py-3 font-normal">
								Status
							</th>
							<th scope="col" className="text-right px-4 py-3 font-normal">
								Days Alive
							</th>
						</tr>
					</thead>
					<tbody>
						{entries.map((entry, idx) => {
							const rank = idx + 1;
							const href = hrefFor(entry);
							return (
								<tr
									key={entry.id || `${entry.name}-${rank}`}
									className="border-t border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer"
									onClick={() => router.push(href)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											router.push(href);
										}
									}}
								>
									<td className="px-4 py-3 align-middle">
										<RankCell rank={rank} />
									</td>
									<td className="px-4 py-3 align-middle">
										<Link
											href={href}
											className="flex items-center gap-3 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/40 rounded-sm"
											onClick={(e) => e.stopPropagation()}
										>
											<AgentAvatar entry={entry} />
											<span className="min-w-0">
												<span className="text-white truncate block">{entry.name}</span>
												{entry.ticker ? (
													<span className="text-[11px] text-neutral-500 font-mono truncate block">${entry.ticker}</span>
												) : null}
											</span>
										</Link>
									</td>
									<td className="px-4 py-3 align-middle text-right text-white font-mono tabular-nums">
										{formatUsdExact(entry.treasuryUsd)}
									</td>
									<td className="px-4 py-3 align-middle text-right text-neutral-300 font-mono tabular-nums">
										{formatUsdExact(entry.dailyBurnUsd)}
									</td>
									<td className={`px-4 py-3 align-middle text-right font-mono tabular-nums ${runwayColor(entry)}`}>
										{formatRunway(entry.runwayDays)}
									</td>
									<td className="px-4 py-3 align-middle">
										<StatusBadge status={entry.status} />
									</td>
									<td className="px-4 py-3 align-middle text-right text-neutral-300 font-mono tabular-nums">
										{entry.daysAlive}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{/* Mobile card list */}
			<ul className="md:hidden flex flex-col gap-3">
				{entries.map((entry, idx) => {
					const rank = idx + 1;
					const href = hrefFor(entry);
					return (
						<li key={entry.id || `${entry.name}-${rank}`}>
							<Link
								href={href}
								className="block p-4 rounded-md border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
							>
								<div className="flex items-center gap-3 mb-3">
									<RankCell rank={rank} />
									<AgentAvatar entry={entry} />
									<div className="min-w-0 flex-1">
										<div className="text-white truncate">{entry.name}</div>
										{entry.ticker ? (
											<div className="text-[11px] text-neutral-500 font-mono truncate">${entry.ticker}</div>
										) : null}
									</div>
									<StatusBadge status={entry.status} />
								</div>
								<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
									<div className="flex items-center justify-between">
										<dt className="text-neutral-500 uppercase tracking-wide">treasury</dt>
										<dd className="text-white font-mono tabular-nums">{formatUsdExact(entry.treasuryUsd)}</dd>
									</div>
									<div className="flex items-center justify-between">
										<dt className="text-neutral-500 uppercase tracking-wide">burn</dt>
										<dd className="text-neutral-300 font-mono tabular-nums">{formatUsdExact(entry.dailyBurnUsd)}</dd>
									</div>
									<div className="flex items-center justify-between">
										<dt className="text-neutral-500 uppercase tracking-wide">runway</dt>
										<dd className={`font-mono tabular-nums ${runwayColor(entry)}`}>{formatRunway(entry.runwayDays)}</dd>
									</div>
									<div className="flex items-center justify-between">
										<dt className="text-neutral-500 uppercase tracking-wide">Days alive</dt>
										<dd className="text-neutral-300 font-mono tabular-nums">{entry.daysAlive}</dd>
									</div>
								</dl>
							</Link>
						</li>
					);
				})}
			</ul>
		</>
	);
}
