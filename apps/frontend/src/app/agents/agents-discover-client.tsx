"use client";

import AgentCardV2Skeleton from "@/components/agents-discover/agent-card-v2-skeleton";
import AgentGrid from "@/components/agents-discover/agent-grid";
import EmptyState from "@/components/agents-discover/empty-state";
import FilterBar from "@/components/agents-discover/filter-bar";
import PaginationBar from "@/components/agents-discover/pagination-bar";
import type { AgentListItem, AgentSort, AgentStatusFilter } from "@/components/agents-discover/types";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { SurfaceCard } from "@/components/ui/surface-card";
import { fetchAgents } from "@/lib/agents-api";
import { RotateCcw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 24;

function parseStatus(v: string | null): AgentStatusFilter {
	return v === "active" || v === "graduated" ? v : "all";
}

function parseSort(v: string | null): AgentSort {
	return v === "volume_24h" || v === "market_cap" ? v : "newest";
}

function parsePage(v: string | null): number {
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

function AgentsDiscoverInner() {
	const searchParams = useSearchParams();
	const { status, sort, page } = useMemo(() => {
		return {
			status: parseStatus(searchParams?.get("status") ?? null),
			sort: parseSort(searchParams?.get("sort") ?? null),
			page: parsePage(searchParams?.get("page") ?? null),
		};
	}, [searchParams]);

	const [data, setData] = useState<{ agents: AgentListItem[]; total: number } | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the retry trigger
	useEffect(() => {
		let cancelled = false;
		setData(null);
		setError(null);
		fetchAgents({
			limit: PAGE_SIZE,
			offset: page * PAGE_SIZE,
			status,
			sort,
		})
			.then((res) => {
				if (!cancelled) setData({ agents: res.agents, total: res.total });
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				console.error("agents fetch failed", err);
				setError(err instanceof Error ? err : new Error(String(err)));
			});
		return () => {
			cancelled = true;
		};
	}, [status, sort, page, reloadKey]);

	const agents = data?.agents ?? [];
	const total = data?.total ?? 0;
	const loading = data === null && error === null;

	const countMeta = loading ? (
		<div className="h-3 w-48 bg-white/5 rounded-sm" />
	) : (
		<div className="text-[11px] md:text-xs font-mono text-white/45">
			<span className="text-white/80">{total.toLocaleString()}</span>{" "}
			<span className="uppercase tracking-[0.18em]">agents launched on waifu.fun</span>
		</div>
	);

	return (
		<PageShell maxWidth="wide">
			<PageHeader eyebrow="waifu.fun / agents" title="agents" right={countMeta} />
			<div className="mb-0">
				<FilterBar status={status} sort={sort} />
			</div>

			<div className="mt-8">
				{loading ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{Array.from({ length: 9 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<AgentCardV2Skeleton key={i} />
						))}
					</div>
				) : error ? (
					<AgentsListError onRetry={() => setReloadKey((k) => k + 1)} />
				) : agents.length === 0 ? (
					<EmptyState
						title={status === "all" ? "no agents yet." : `no ${status} agents.`}
						subtitle={status === "all" ? "be the first." : "try a different filter, or launch one."}
						ctaHref="/create/wizard"
						ctaLabel="launch yours"
					/>
				) : (
					<AgentGrid agents={agents} />
				)}
			</div>

			{!loading ? <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} /> : null}
		</PageShell>
	);
}

function AgentsFallback() {
	return (
		<PageShell maxWidth="wide">
			<PageHeader
				eyebrow="waifu.fun / agents"
				title="agents"
				right={<div className="h-3 w-48 bg-white/5 rounded-sm" />}
			/>
			<div className="h-12 border-y border-white/10" />
			<div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{Array.from({ length: 9 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
					<AgentCardV2Skeleton key={i} />
				))}
			</div>
		</PageShell>
	);
}

/**
 * Quiet, branded error state when the agents list fetch fails outright.
 * Shows a retry button rather than letting the page sit on skeletons
 * forever. No 'oops' copy, no exclamation marks.
 */
function AgentsListError({ onRetry }: { onRetry: () => void }) {
	return (
		<SurfaceCard padding="lg" className="text-center">
			<div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/40">agents / unavailable</div>
			<h2 className="mt-3 text-xl tracking-tight md:text-2xl">we couldn&apos;t load the agents list</h2>
			<p className="mx-auto mt-2.5 max-w-[44ch] text-sm leading-relaxed text-white/55">
				the api responded with an error. retry once; if it keeps failing the backend is likely warming up.
			</p>
			<button
				type="button"
				onClick={onRetry}
				className="mt-6 inline-flex h-10 items-center gap-2 rounded-sm border border-[#00ff87]/40 bg-[#00ff87]/[0.06] px-5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ff87] transition-colors duration-200 hover:border-[#00ff87]/60 hover:bg-[#00ff87]/[0.1]"
			>
				<RotateCcw className="h-3 w-3" strokeWidth={1.75} />
				retry
			</button>
		</SurfaceCard>
	);
}

export default function AgentsDiscoverClient() {
	return (
		<Suspense fallback={<AgentsFallback />}>
			<AgentsDiscoverInner />
		</Suspense>
	);
}
