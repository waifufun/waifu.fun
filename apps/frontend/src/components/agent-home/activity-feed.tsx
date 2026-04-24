"use client";

import { cn, timeAgo } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { describeEvent, eventMarker } from "./event-copy";
import type { AgentEvent, AgentEventPage } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.waifu.fun";
const PAGE_SIZE = 25;

type LoadState = "idle" | "loading" | "ok" | "empty" | "unavailable";

/**
 * Live event feed for an agent. Hits GET /v2/agents/:id/events which ships in
 * W1.7 — when it 404s we render the empty state rather than crashing.
 */
export default function ActivityFeed({ agentId }: { agentId: string }) {
	const [events, setEvents] = useState<AgentEvent[]>([]);
	const [cursor, setCursor] = useState<string | null>(null);
	const [state, setState] = useState<LoadState>("idle");
	const [loadingMore, setLoadingMore] = useState(false);

	const fetchPage = useCallback(
		async (after: string | null): Promise<AgentEventPage | "unavailable" | null> => {
			const qs = new URLSearchParams();
			qs.set("limit", String(PAGE_SIZE));
			if (after) qs.set("cursor", after);
			try {
				const res = await fetch(`${API_BASE}/v2/agents/${agentId}/events?${qs.toString()}`, {
					credentials: "include",
				});
				// 404 / 501 → endpoint not deployed yet (W1.7 ships in parallel)
				if (res.status === 404 || res.status === 501) return "unavailable";
				if (!res.ok) return null;
				const json = await res.json().catch(() => null);
				const data = (json?.data ?? json) as Partial<AgentEventPage> | null;
				if (!data || !Array.isArray(data.events)) return null;
				return {
					events: data.events,
					nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
				};
			} catch {
				return "unavailable";
			}
		},
		[agentId],
	);

	useEffect(() => {
		let cancelled = false;
		setState("loading");
		(async () => {
			const page = await fetchPage(null);
			if (cancelled) return;
			if (page === "unavailable") {
				setState("unavailable");
				return;
			}
			if (!page) {
				setState("empty");
				return;
			}
			setEvents(page.events);
			setCursor(page.nextCursor);
			setState(page.events.length === 0 ? "empty" : "ok");
		})();
		return () => {
			cancelled = true;
		};
	}, [fetchPage]);

	const loadMore = useCallback(async () => {
		if (!cursor || loadingMore) return;
		setLoadingMore(true);
		const page = await fetchPage(cursor);
		if (page && page !== "unavailable") {
			setEvents((prev) => [...prev, ...page.events]);
			setCursor(page.nextCursor);
		}
		setLoadingMore(false);
	}, [cursor, loadingMore, fetchPage]);

	if (state === "loading" || state === "idle") {
		return <FeedSkeleton />;
	}

	if (state === "unavailable" || state === "empty") {
		return <EmptyState />;
	}

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			<div className="divide-y divide-white/5">
				{events.map((e) => (
					<EventRow key={e.id} event={e} />
				))}
			</div>
			{cursor && (
				<button
					type="button"
					onClick={loadMore}
					disabled={loadingMore}
					className="w-full px-4 py-3 text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white/70 hover:bg-white/[0.02] transition-colors border-t border-white/5 disabled:opacity-50"
				>
					{loadingMore ? "loading..." : "load more"}
				</button>
			)}
		</div>
	);
}

function EventRow({ event }: { event: AgentEvent }) {
	const marker = eventMarker(event.eventType);
	const description = describeEvent(event);
	const txHref = event.txHash ? `https://bscscan.com/tx/${event.txHash}` : null;

	return (
		<div className="flex items-center gap-3 px-4 py-2.5 text-[11px] font-mono">
			<span className="text-white/30 shrink-0 w-10 text-[10px] uppercase tracking-[0.12em]">{marker}</span>
			<span className="flex-1 min-w-0 text-white/75 truncate">{description}</span>
			{txHref && (
				<a
					href={txHref}
					target="_blank"
					rel="noreferrer"
					className="text-white/30 hover:text-[#00ff87] shrink-0 inline-flex items-center"
					aria-label="open on bscscan"
				>
					<ExternalLink className="w-3 h-3" strokeWidth={1.5} />
				</a>
			)}
			<span className="text-white/30 w-14 text-right shrink-0 text-[10px]">{timeAgo(event.createdAt)}</span>
		</div>
	);
}

function FeedSkeleton() {
	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden divide-y divide-white/5">
			{Array.from({ length: 5 }, (_, i) => i).map((i) => (
				<div key={i} className="flex items-center gap-3 px-4 py-2.5">
					<div className="h-3 w-8 rounded-sm bg-white/[0.04] animate-pulse" />
					<div
						className={cn("h-3 rounded-sm bg-white/[0.04] animate-pulse flex-1", i % 2 ? "max-w-[70%]" : "max-w-[85%]")}
					/>
					<div className="h-3 w-10 rounded-sm bg-white/[0.04] animate-pulse" />
				</div>
			))}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-8 text-center">
			<div className="text-[10px] font-mono text-white/30 mb-2">[ no activity yet ]</div>
			<div className="text-xs text-white/50 leading-relaxed">
				the agent hasn't done anything on-chain yet. come back soon.
			</div>
		</div>
	);
}
