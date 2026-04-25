"use client";

import type { AgentEvent } from "@/lib/api/patron";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
	events: AgentEvent[] | undefined;
	isLoading: boolean;
	error: Error | null;
};

const TYPE_STYLES: Record<string, { dot: string; label: string }> = {
	trade: { dot: "bg-[#00ff87]", label: "Trade" },
	tweet: { dot: "bg-sky-400", label: "Tweet" },
	reconcile: { dot: "bg-purple-400", label: "Reconcile" },
	pause: { dot: "bg-[#a1a1aa]", label: "Pause" },
	resume: { dot: "bg-[#00ff87]", label: "Resume" },
	error: { dot: "bg-red-400", label: "Error" },
};

function styleFor(type: string) {
	const key = type.toLowerCase();
	return TYPE_STYLES[key] ?? { dot: "bg-neutral-400", label: type };
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
		<section
			aria-label="Activity feed"
			className="p-5 rounded-md border border-stroke-strong bg-[#0C0C0C]"
		>
			<header className="flex items-center justify-between mb-4">
				<h2 className="text-sm font-medium text-white uppercase tracking-wide">Activity</h2>
				<span className="text-xs text-neutral-500">Last 30 events</span>
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
				<p className="text-sm text-red-300" role="alert">
					Couldn't load activity. {error.message}
				</p>
			) : !events || events.length === 0 ? (
				<p className="text-sm text-neutral-500">No activity yet.</p>
			) : (
				<ul className="divide-y divide-stroke">
					{events.map((event) => {
						const s = styleFor(event.type);
						return (
							<li key={event.id} className="py-3 flex items-start gap-3">
								<span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", s.dot)} aria-hidden />
								<div className="flex-1 min-w-0">
									<div className="flex items-baseline justify-between gap-3">
										<span className="text-sm font-medium text-white uppercase tracking-wide">{s.label}</span>
										<span className="text-xs text-neutral-500 shrink-0">{formatTime(event.ts)}</span>
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
