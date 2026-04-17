import AgentGrid from "@/components/agents-discover/agent-grid";
import EmptyState from "@/components/agents-discover/empty-state";
import FilterBar from "@/components/agents-discover/filter-bar";
import PaginationBar from "@/components/agents-discover/pagination-bar";
import type { AgentSort, AgentStatusFilter } from "@/components/agents-discover/types";
import { fetchAgents } from "@/lib/agents-api";
import type { Metadata } from "next";
import { Suspense } from "react";

export const revalidate = 10;

const PAGE_SIZE = 24;

export const metadata: Metadata = {
	title: "agents — waifu.fun",
	description: "browse every agent launched on waifu.fun. each has a wallet, a brain, a token, and a treasury.",
};

function parseStatus(v: unknown): AgentStatusFilter {
	return v === "active" || v === "graduated" ? v : "all";
}

function parseSort(v: unknown): AgentSort {
	return v === "volume_24h" || v === "market_cap" ? v : "newest";
}

function parsePage(v: unknown): number {
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

export default async function AgentsPage({
	searchParams,
}: {
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
	const params = await searchParams;
	const status = parseStatus(params.status);
	const sort = parseSort(params.sort);
	const page = parsePage(params.page);

	const { agents, total } = await fetchAgents({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
		status,
		sort,
	});

	return (
		<div className="min-h-screen bg-black text-white">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pt-10 pb-24">
				{/* header */}
				<div className="mb-8">
					<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#22c55e] mb-3">
						waifu.fun / agents
					</div>
					<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
						<h1 className="text-3xl md:text-4xl leading-tight tracking-tight">agents</h1>
						<div className="text-[11px] md:text-xs font-mono text-white/45">
							<span className="text-white/80">{total.toLocaleString()}</span>{" "}
							<span className="uppercase tracking-[0.18em]">agents launched on waifu.fun</span>
						</div>
					</div>
				</div>

				{/* filter row */}
				<Suspense fallback={<div className="h-12 border-y border-white/10" />}>
					<FilterBar status={status} sort={sort} />
				</Suspense>

				{/* grid */}
				<div className="mt-8">
					{agents.length === 0 ? (
						<EmptyState
							title={status === "all" ? "no agents yet." : `no ${status} agents right now.`}
							subtitle={status === "all" ? "be the first to launch one." : "try switching filters, or launch one."}
						/>
					) : (
						<AgentGrid agents={agents} />
					)}
				</div>

				<Suspense fallback={null}>
					<PaginationBar page={page} pageSize={PAGE_SIZE} total={total} />
				</Suspense>
			</div>
		</div>
	);
}
