"use client";

import AgentCardSkeleton from "@/components/agents-discover/agent-card-skeleton";
import AgentGrid from "@/components/agents-discover/agent-grid";
import EmptyState from "@/components/agents-discover/empty-state";
import FilterBar from "@/components/agents-discover/filter-bar";
import PaginationBar from "@/components/agents-discover/pagination-bar";
import type { AgentListItem, AgentSort, AgentStatusFilter } from "@/components/agents-discover/types";
import { fetchAgents } from "@/lib/agents-api";
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
			status: parseStatus(searchParams.get("status")),
			sort: parseSort(searchParams.get("sort")),
			page: parsePage(searchParams.get("page")),
		};
	}, [searchParams]);

	const [data, setData] = useState<{ agents: AgentListItem[]; total: number } | null>(null);

	useEffect(() => {
		let cancelled = false;
		void fetchAgents({
			limit: PAGE_SIZE,
			offset: page * PAGE_SIZE,
			status,
			sort,
		}).then((res) => {
			if (!cancelled) setData({ agents: res.agents, total: res.total });
		});
		return () => {
			cancelled = true;
		};
	}, [status, sort, page]);

	const agents = data?.agents ?? [];
	const total = data?.total ?? 0;
	const loading = data === null;

	return (
		<div className="min-h-screen text-white">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pt-10 pb-24">
				<div className="mb-8">
					<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-3">
						waifu.fun / agents
					</div>
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<h1 className="text-3xl md:text-4xl leading-tight tracking-tight">agents</h1>
						<div className="text-[11px] md:text-xs font-mono text-white/45">
							{loading ? (
								<div className="h-3 w-48 bg-white/5 rounded-sm" />
							) : (
								<>
									<span className="text-white/80">{total.toLocaleString()}</span>{" "}
									<span className="uppercase tracking-[0.18em]">agents launched on waifu.fun</span>
								</>
							)}
						</div>
					</div>
				</div>

				<div className="mb-0">
					<FilterBar status={status} sort={sort} />
				</div>

				<div className="mt-8">
					{loading ? (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{Array.from({ length: 9 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
								<AgentCardSkeleton key={i} />
							))}
						</div>
					) : agents.length === 0 ? (
						<EmptyState
							title={status === "all" ? "no agents yet." : `no ${status} agents.`}
							subtitle={status === "all" ? "be the first." : "try a different filter, or launch one."}
						/>
					) : (
						<AgentGrid agents={agents} />
					)}
				</div>

				{!loading ? <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} /> : null}
			</div>
		</div>
	);
}

function AgentsFallback() {
	return (
		<div className="min-h-screen text-white">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pt-10 pb-24">
				<div className="mb-8">
					<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-3">
						waifu.fun / agents
					</div>
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<h1 className="text-3xl md:text-4xl leading-tight tracking-tight">agents</h1>
						<div className="h-3 w-48 bg-white/5 rounded-sm" />
					</div>
				</div>
				<div className="h-12 border-y border-white/10" />
				<div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{Array.from({ length: 9 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<AgentCardSkeleton key={i} />
					))}
				</div>
			</div>
		</div>
	);
}

export default function AgentsDiscoverClient() {
	return (
		<Suspense fallback={<AgentsFallback />}>
			<AgentsDiscoverInner />
		</Suspense>
	);
}
