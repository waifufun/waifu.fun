"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { AgentEvent } from "@/lib/api/patron";
import { cn } from "@/lib/utils";

type Props = {
	events: AgentEvent[] | undefined;
	isLoading: boolean;
	error: Error | null;
};

// Single-accent discipline (.impeccable.md): no rainbow palette. live
// events read on --accent, terminal/error reads on --negative, everything
// neutral sits on a muted dot. labels stay lowercase TPOT.
const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
	trade: { dot: "bg-[var(--accent)]", label: "trade" },
	tweet: { dot: "bg-[var(--text-tertiary)]", label: "tweet" },
	reconcile: { dot: "bg-[var(--text-tertiary)]", label: "reconcile" },
	pause: { dot: "bg-[var(--text-tertiary)]", label: "pause" },
	resume: { dot: "bg-[var(--accent)]", label: "resume" },
	error: { dot: "bg-[var(--negative)]", label: "error" },
};

function styleFor(type: string) {
	const key = type.toLowerCase();
	return TYPE_STYLES[key] ?? { dot: "bg-[var(--text-tertiary)]", label: type.toLowerCase() };
}

function formatTime(iso: string | null | undefined): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const diff = Date.now() - d.getTime();
	const sec = Math.floor(diff / 1000);
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	return d.toLocaleDateString();
}

export default function ActivityFeed({ events, isLoading, error }: Props) {
	return (
		<section aria-label="activity feed" className="p-5 rounded-sm border border-stroke-strong bg-[#0C0C0C]">
			<header className="flex items-center justify-between mb-4">
				<h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">activity</h2>
				<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">last 30 events</span>
			</header>

			{isLoading ? (
				<ul className="space-y-2">
					{[0, 1, 2, 3, 4].map((i) => (
						<li key={i}>
							<Skeleton className="h-10 w-full rounded" />
						</li>
					))}
				</ul>
			) : error ? (
				<p className="font-mono text-[11px] text-[var(--negative)]" role="alert">
					couldn't load activity. {error.message}
				</p>
			) : !events || events.length === 0 ? (
				<p className="font-mono text-[11px] text-neutral-500">no activity yet · onchain feed quiet</p>
			) : (
				<ul className="divide-y divide-stroke">
					{events.map((event) => {
						const s = styleFor(event.type);
						return (
							<li key={event.id} className="py-3 flex items-start gap-3">
								<span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", s.dot)} aria-hidden />
								<div className="flex-1 min-w-0">
									<div className="flex items-baseline justify-between gap-3">
										<span className="font-mono text-[11px] lowercase tracking-wide text-white">{s.label}</span>
										<span className="font-mono text-[10px] tabular-nums text-neutral-500 shrink-0">
											{formatTime(event.ts)}
										</span>
									</div>
									{event.summary ? (
										<p className="text-sm text-neutral-300 mt-0.5 break-words">{event.summary}</p>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
