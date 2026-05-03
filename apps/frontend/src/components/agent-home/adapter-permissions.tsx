"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.waifu.fun";

export type AdapterCap = {
	maxPerTx?: string;
	maxPerDay?: string;
	slippageBps?: number;
};

export type AgentAdapter = {
	slug: string;
	label?: string;
	enabled: boolean;
	caps?: AdapterCap;
};

type LoadState = { state: "loading" } | { state: "ok"; adapters: AgentAdapter[] } | { state: "unavailable" };

/**
 * Read-only preview of the onchain adapters the agent has enabled. No editing
 * from this surface: the policy editor at /agent/:id/policy is coming in v1.1.
 *
 * Endpoint GET /v2/agents/:id/adapters isn't live yet; 404 → "unavailable"
 * empty state rather than invented permissions.
 */
export default function AdapterPermissions({ agentId }: { agentId: string }) {
	const [status, setStatus] = useState<LoadState>({ state: "loading" });

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`${API_BASE}/v2/agents/${agentId}/adapters`, {
					next: { revalidate: 30 },
				});
				if (cancelled) return;
				if (res.status === 404 || res.status === 501) {
					setStatus({ state: "unavailable" });
					return;
				}
				if (!res.ok) {
					setStatus({ state: "ok", adapters: [] });
					return;
				}
				const json = await res.json().catch(() => null);
				const raw = (json?.data?.adapters ?? json?.adapters ?? json?.data ?? json) as unknown;
				const adapters = Array.isArray(raw) ? (raw as AgentAdapter[]).filter(isAdapter) : [];
				setStatus({ state: "ok", adapters });
			} catch {
				if (!cancelled) setStatus({ state: "unavailable" });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [agentId]);

	const enabled = status.state === "ok" ? status.adapters.filter((a) => a.enabled) : [];

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			<div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">adapters</div>
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">
					{status.state === "loading"
						? "..."
						: status.state === "unavailable"
							? "unavailable"
							: `${enabled.length} enabled`}
				</span>
			</div>

			{status.state === "loading" && <SkeletonRows />}

			{status.state === "ok" && enabled.length === 0 && (
				<div className="px-4 py-8 text-center">
					<div className="text-[10px] font-mono text-white/30 mb-2">[ no adapters configured ]</div>
					<div className="text-xs text-white/50 leading-relaxed">
						this agent has no onchain adapters enabled. it can observe but not act.
					</div>
				</div>
			)}

			{status.state === "unavailable" && (
				<div className="px-4 py-8 text-center">
					<div className="text-[10px] font-mono text-white/30 mb-2">[ adapters unavailable ]</div>
					<div className="text-xs text-white/50 leading-relaxed">
						adapter permissions api not live yet. check back soon.
					</div>
				</div>
			)}

			{status.state === "ok" && enabled.length > 0 && (
				<div className="divide-y divide-white/5">
					{enabled.map((a) => (
						<AdapterRow key={a.slug} adapter={a} />
					))}
				</div>
			)}

			<div className="px-4 py-3 border-t border-white/5">
				<PolicyLink agentId={agentId} />
			</div>
		</div>
	);
}

function AdapterRow({ adapter }: { adapter: AgentAdapter }) {
	const label = adapter.label || prettify(adapter.slug);
	const caps = adapter.caps;
	return (
		<div className="flex items-center gap-3 px-4 py-3">
			<span className={cn("w-1.5 h-1.5 rounded-full shrink-0", adapter.enabled ? "bg-[#00ff87]" : "bg-white/20")} />
			<div className="flex-1 min-w-0">
				<div className="text-xs text-white/85 truncate">{label}</div>
				<div className="text-[10px] font-mono text-white/40 mt-0.5 truncate">{adapter.slug}</div>
			</div>
			{caps && (
				<div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 text-right">
					{caps.maxPerTx && (
						<div className="text-[10px] font-mono text-white/50">
							<span className="text-white/30">tx ≤ </span>
							{caps.maxPerTx}
						</div>
					)}
					{caps.maxPerDay && (
						<div className="text-[10px] font-mono text-white/50">
							<span className="text-white/30">day ≤ </span>
							{caps.maxPerDay}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function PolicyLink({ agentId }: { agentId: string }) {
	// policy editor route may not exist yet; render as disabled hint
	// when the route lands, swap this to the real Link.
	const live = false;
	if (live) {
		return (
			<Link
				href={`/agent/${agentId}/policy`}
				className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-[#00ff87] transition-colors"
			>
				edit policy
				<ChevronRight className="w-3 h-3" />
			</Link>
		);
	}
	return (
		<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/25">policy editor · coming in v1.1</div>
	);
}

function SkeletonRows() {
	return (
		<div className="divide-y divide-white/5">
			{[0, 1, 2].map((i) => (
				<div key={i} className="flex items-center gap-3 px-4 py-3">
					<div className="w-1.5 h-1.5 rounded-full bg-white/10 shrink-0" />
					<div className="flex-1 space-y-1">
						<div className="h-3 w-32 rounded-sm bg-white/[0.04] animate-pulse" />
						<div className="h-2.5 w-20 rounded-sm bg-white/[0.04] animate-pulse" />
					</div>
				</div>
			))}
		</div>
	);
}

function isAdapter(v: unknown): v is AgentAdapter {
	if (!v || typeof v !== "object") return false;
	const r = v as Record<string, unknown>;
	return typeof r.slug === "string" && typeof r.enabled === "boolean";
}

function prettify(slug: string): string {
	return slug.replace(/[-_]/g, " ");
}
