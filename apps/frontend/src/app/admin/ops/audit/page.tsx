"use client";

import { useAdminTokenState } from "@/components/admin/ops-token-gate";
import { type AdminAuditEntry, useAdminAuditLog } from "@/lib/api/admin";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

const ACTION_TONE: Record<string, string> = {
	"pause-brain": "text-amber-300",
	"resume-brain": "text-emerald-300",
	"freeze-withdrawals": "text-orange-300",
	"unfreeze-withdrawals": "text-emerald-300",
	kill: "text-red-300",
};

function formatTs(iso: string | null | undefined): string {
	if (!iso) return "–";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "–";
	return `${d.toISOString().replace("T", " ").slice(0, 19)}Z`;
}

function shorten(value: string | null, head = 6, tail = 4): string {
	if (!value) return "–";
	if (value.length <= head + tail + 2) return value;
	return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export default function AdminOpsAuditPage() {
	const { token } = useAdminTokenState();
	const search = useSearchParams();
	const agentIdFilter = search?.get("agentId") ?? null;

	const { data, isLoading, error, refetch, isFetching } = useAdminAuditLog({
		token,
		agentId: agentIdFilter,
		limit: 100,
	});

	const entries = data?.entries ?? [];
	const supported = data?.supported ?? true;

	const summary = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const e of entries) counts[e.action] = (counts[e.action] ?? 0) + 1;
		return counts;
	}, [entries]);

	return (
		<div className="space-y-4">
			<div className="flex items-end justify-between gap-4 flex-wrap">
				<div>
					<h2 className="text-base font-mono text-white">Audit log</h2>
					<p className="text-xs text-neutral-500 font-mono">
						{isLoading
							? "loading…"
							: agentIdFilter
								? `${entries.length} entries · agent ${shorten(agentIdFilter)}`
								: `${entries.length} entries · last 100 across all agents`}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{agentIdFilter ? (
						<Link
							href="/admin/ops/audit"
							className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 hover:text-white border border-white/10 hover:border-white/30 rounded-sm px-2 py-1"
						>
							clear filter
						</Link>
					) : null}
					<button
						type="button"
						onClick={() => refetch()}
						disabled={isFetching}
						className="text-[11px] font-mono uppercase tracking-wider text-neutral-300 border border-white/10 hover:border-white/30 hover:text-white px-3 py-1.5 rounded-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60"
						aria-label="Refresh audit log"
					>
						{isFetching ? "…" : "refresh"}
					</button>
				</div>
			</div>

			{error ? (
				<div role="alert" className="rounded-sm border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
					Couldn't load audit log. {(error as Error).message}
				</div>
			) : null}

			{!supported ? (
				<output className="block rounded-sm border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-mono text-amber-200">
					Audit log endpoint not yet available on this backend. TODO(W5.7): wire
					<code className="mx-1">GET /v2/admin/audit-log</code>.
				</output>
			) : null}

			{Object.keys(summary).length > 0 ? (
				<div className="flex items-center gap-2 flex-wrap" aria-label="Audit action summary">
					{Object.entries(summary).map(([action, count]) => (
						<span
							key={action}
							className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border border-white/10 rounded-sm ${
								ACTION_TONE[action] ?? "text-neutral-300"
							}`}
						>
							{action} · {count}
						</span>
					))}
				</div>
			) : null}

			<div className="rounded-md border border-white/5 bg-[#0c0c0e] overflow-x-auto">
				<table className="w-full text-sm">
					<thead className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 border-b border-white/5">
						<tr>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Timestamp
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Agent
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Action
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Actor
							</th>
							<th scope="col" className="text-left px-3 py-2 font-medium">
								Reason
							</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<tr>
								<td colSpan={5} className="px-3 py-8 text-center text-xs font-mono text-neutral-500">
									loading audit log…
								</td>
							</tr>
						) : entries.length === 0 ? (
							<tr>
								<td colSpan={5} className="px-3 py-8 text-center text-xs font-mono text-neutral-500">
									{supported ? "no audit entries" : "endpoint not wired"}
								</td>
							</tr>
						) : (
							entries.map((entry) => <AuditRow key={String(entry.id)} entry={entry} />)
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function AuditRow({ entry }: { entry: AdminAuditEntry }) {
	const tone = ACTION_TONE[entry.action] ?? "text-neutral-200";
	return (
		<tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] align-top">
			<td className="px-3 py-2 text-[11px] font-mono text-neutral-300 whitespace-nowrap">
				{formatTs(entry.timestamp)}
			</td>
			<td className="px-3 py-2 text-[11px] font-mono">
				{entry.agentId ? (
					<Link
						href={`/admin/ops/audit?agentId=${encodeURIComponent(entry.agentId)}`}
						className="text-neutral-200 hover:text-white underline decoration-dotted underline-offset-2"
						title={entry.agentId}
					>
						{shorten(entry.agentId)}
					</Link>
				) : (
					<span className="text-neutral-500">–</span>
				)}
			</td>
			<td className={`px-3 py-2 text-[11px] font-mono uppercase tracking-wider ${tone}`}>{entry.action}</td>
			<td className="px-3 py-2 text-[11px] font-mono text-neutral-300" title={entry.actor ?? undefined}>
				{shorten(entry.actor)}
			</td>
			<td className="px-3 py-2 text-[11px] font-mono text-neutral-400 max-w-[420px]">
				{entry.reason ? entry.reason : <span className="text-neutral-600">–</span>}
			</td>
		</tr>
	);
}
