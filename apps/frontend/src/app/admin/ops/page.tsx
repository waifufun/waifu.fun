"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdminAgents, type AdminAgent, combinedStatus } from "@/lib/api/admin";
import { useAdminTokenState } from "@/components/admin/ops-token-gate";
import StatusPill from "@/components/admin/agent-status-pill";

function formatTs(iso: string | null | undefined): string {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return `${d.toISOString().replace("T", " ").slice(0, 19)}Z`;
}

export default function AdminOpsAgentsPage() {
	const { token } = useAdminTokenState();
	const { data: agents, isLoading, error, refetch, isFetching } = useAdminAgents(token);
	const [filter, setFilter] = useState("");

	const filtered = useMemo(() => {
		if (!agents) return [];
		const q = filter.trim().toLowerCase();
		if (!q) return agents;
		return agents.filter(
			(a) => a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
		);
	}, [agents, filter]);

	return (
		<div className="space-y-4">
			<div className="flex items-end justify-between gap-4 flex-wrap">
				<div>
					<h2 className="text-base font-mono text-white">Agent fleet</h2>
					<p className="text-xs text-neutral-500 font-mono">
						{agents ? `${agents.length} total` : "loading…"}
						{filter ? ` · ${filtered.length} matching` : ""}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<label htmlFor="admin-agent-filter" className="sr-only">
						Filter agents
					</label>
					<input
						id="admin-agent-filter"
						type="search"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="filter by name / ticker / id"
						className="bg-black/40 border border-white/10 rounded-sm px-3 py-1.5 text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-red-400 w-[260px]"
					/>
					<button
						type="button"
						onClick={() => refetch()}
						disabled={isFetching}
						className="text-[11px] font-mono uppercase tracking-wider text-neutral-300 border border-white/10 hover:border-white/30 hover:text-white px-3 py-1.5 rounded-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60"
						aria-label="Refresh agent list"
					>
						{isFetching ? "…" : "refresh"}
					</button>
				</div>
			</div>

			{error ? (
				<div role="alert" className="rounded-sm border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
					Couldn't load agents. {(error as Error).message}
				</div>
			) : null}

			<div className="rounded-md border border-white/5 bg-[#0c0c0e] overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 border-b border-white/5">
						<tr>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Name
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Ticker
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Status
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Brain
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Withdrawals
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Killed
							</th>
							<th scope="col" className="text-right px-3 py-2 font-medium">
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<tr>
								<td colSpan={7} className="px-3 py-8 text-center text-xs font-mono text-neutral-500">
									loading agents…
								</td>
							</tr>
						) : filtered.length === 0 ? (
							<tr>
								<td colSpan={7} className="px-3 py-8 text-center text-xs font-mono text-neutral-500">
									{agents && agents.length > 0 ? "no matches" : "no agents found"}
								</td>
							</tr>
						) : (
							filtered.map((agent) => <AgentRow key={agent.id} agent={agent} />)
						)}
					</tbody>
				</table>
			</div>

			<p className="text-[10px] font-mono text-neutral-600">
				Status fields source from <code>GET /v2/admin/agents/:id/status</code>; refresh after every mutation.
			</p>
		</div>
	);
}

function AgentRow({ agent, token }: { agent: AdminAgent; token: string | null }) {
	const status = combinedStatus(agent);
	return (
		<tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
			<td className="px-3 py-2 align-top">
				<div className="flex flex-col">
					<span className="text-white font-medium truncate max-w-[280px]">{agent.name}</span>
					<span className="text-[10px] font-mono text-neutral-600 truncate max-w-[280px]">{agent.id}</span>
				</div>
			</td>
			<td className="px-3 py-2 align-top text-xs font-mono text-neutral-300">${agent.ticker || "—"}</td>
			<td className="px-3 py-2 align-top">
				<StatusPill status={status} />
			</td>
			<td className="px-3 py-2 align-top text-[11px] font-mono text-neutral-400">{formatTs(agent.brainPausedAt)}</td>
			<td className="px-3 py-2 align-top text-[11px] font-mono text-neutral-400">
				{formatTs(agent.withdrawalsPausedAt)}
			</td>
			<td className="px-3 py-2 align-top text-[11px] font-mono text-neutral-400">{formatTs(agent.killedAt)}</td>
			<td className="px-3 py-2 align-top text-right">
				<div className="flex flex-col items-end gap-2">
					<AgentActionBar agent={agent} token={token} />
					<Link
						href={`/admin/ops/audit?agentId=${encodeURIComponent(agent.id)}`}
						className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-white"
					>
						view audit →
					</Link>
				</div>
			</td>
		</tr>
	);
}
