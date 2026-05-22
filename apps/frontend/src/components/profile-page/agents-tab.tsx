"use client";

import { Button } from "@/components/ui/button";
import { type UserAgent, deleteAgent, getUserAgents, restartAgent, stopAgent } from "@/lib/api";
import { sanitizeExternalUrl } from "@/lib/url-safety";
import { cn, shortenAddress } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bot, ExternalLink, Loader2, RefreshCw, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; toneClass: string; dotClass: string }> = {
	queued: {
		label: "Queued",
		toneClass: "border-sky-500/30 bg-sky-500/10 text-sky-300",
		dotClass: "bg-sky-400",
	},
	provisioning: {
		label: "Provisioning",
		toneClass: "border-sky-500/30 bg-sky-500/10 text-sky-300",
		dotClass: "bg-sky-400 animate-pulse",
	},
	running: {
		label: "Running",
		toneClass: "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]",
		dotClass: "bg-[#00ff87]",
	},
	stopped: {
		label: "Stopped",
		toneClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
		dotClass: "bg-amber-400",
	},
	failed: {
		label: "Failed",
		toneClass: "border-red-500/30 bg-red-500/10 text-red-300",
		dotClass: "bg-red-400",
	},
	deleted: {
		label: "Deleted",
		toneClass: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
		dotClass: "bg-zinc-400",
	},
};

const defaultStatusConfig = {
	label: "Unknown",
	toneClass: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
	dotClass: "bg-zinc-400",
};

function StatusPill({ status }: { status: string }) {
	const config = statusConfig[status] ?? defaultStatusConfig;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.18em]",
				config.toneClass,
			)}
		>
			<span className={cn("size-1.5 rounded-full", config.dotClass)} />
			{config.label}
		</span>
	);
}

function AgentRow({ agent }: { agent: UserAgent }) {
	const queryClient = useQueryClient();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const containerUrl = sanitizeExternalUrl(agent.containerUrl);

	const restartMut = useMutation({
		mutationFn: () => restartAgent(agent.agentId),
		onSuccess: () => {
			toast.success("Agent restart requested");
			queryClient.invalidateQueries({ queryKey: ["user-agents"] });
		},
		onError: (e: Error) => toast.error(e.message || "Failed to restart"),
	});

	const stopMut = useMutation({
		mutationFn: () => stopAgent(agent.agentId),
		onSuccess: () => {
			toast.success("Agent stopped");
			queryClient.invalidateQueries({ queryKey: ["user-agents"] });
		},
		onError: (e: Error) => toast.error(e.message || "Failed to stop"),
	});

	const deleteMut = useMutation({
		mutationFn: () => deleteAgent(agent.agentId),
		onSuccess: () => {
			toast.success("Agent deleted");
			queryClient.invalidateQueries({ queryKey: ["user-agents"] });
		},
		onError: (e: Error) => toast.error(e.message || "Failed to delete"),
	});

	const anyPending = restartMut.isPending || stopMut.isPending || deleteMut.isPending;

	return (
		<div className="border-b border-[rgba(255,255,255,0.06)] last:border-b-0 p-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
			<div className="flex flex-col sm:flex-row sm:items-center gap-3">
				{/* Info */}
				<div className="flex items-center gap-3 flex-1 min-w-0">
					<div className="flex items-center justify-center size-9 rounded-sm bg-[#00ff87]/10 border border-[#00ff87]/20 shrink-0">
						<Bot className="size-4 text-[#00ff87]" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<p className="text-sm font-semibold text-[#e4e4e7] truncate">{agent.agentName}</p>
							<StatusPill status={agent.status} />
						</div>
						<div className="flex items-center gap-3 mt-0.5">
							{agent.tokenAddress && (
								<Link
									href={`/token/evm/56/${agent.tokenAddress}`}
									className="text-[10px] font-mono text-[#00ff87] hover:underline"
								>
									Token: {shortenAddress(agent.tokenAddress)}
								</Link>
							)}
							<span className="text-[10px] font-mono text-[#52525b]">ID: {shortenAddress(agent.agentId)}</span>
						</div>
						{agent.platforms && agent.platforms.length > 0 && (
							<div className="flex items-center gap-1 mt-1">
								{agent.platforms.map((p) => (
									<span
										key={p}
										className="inline-flex rounded-sm border border-white/8 bg-white/3 px-1.5 py-0.5 text-[9px] font-mono uppercase text-[#71717a]"
									>
										{p}
									</span>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-1.5 shrink-0">
					{containerUrl && (
						<a
							href={containerUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center justify-center h-7 w-7 rounded-sm border border-white/8 text-[#a1a1aa] hover:text-[#00ff87] hover:border-[#00ff87]/30 transition-colors"
						>
							<ExternalLink className="size-3" />
						</a>
					)}

					{agent.status === "running" && (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={() => restartMut.mutate()}
								disabled={anyPending}
								className="h-7 px-2 text-[9px] font-mono uppercase text-[#a1a1aa] hover:text-[#00ff87]"
							>
								{restartMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => stopMut.mutate()}
								disabled={anyPending}
								className="h-7 px-2 text-[9px] font-mono uppercase text-amber-300 hover:text-amber-200 border-amber-500/20"
							>
								{stopMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3" />}
							</Button>
						</>
					)}

					{(agent.status === "stopped" || agent.status === "failed") && (
						<Button
							size="sm"
							onClick={() => restartMut.mutate()}
							disabled={anyPending}
							className="h-7 px-2 text-[9px] font-mono uppercase"
						>
							{restartMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
							Restart
						</Button>
					)}

					{(agent.status === "queued" || agent.status === "provisioning") && (
						<span className="flex items-center gap-1 text-[10px] text-sky-300">
							<Loader2 className="size-3 animate-spin" />
						</span>
					)}

					{/* Delete */}
					{agent.status !== "deleted" &&
						(confirmDelete ? (
							<div className="flex items-center gap-1">
								<Button
									variant="outline"
									size="sm"
									onClick={() => deleteMut.mutate()}
									disabled={anyPending}
									className="h-7 px-2 text-[9px] font-mono uppercase text-red-400 hover:text-red-300 border-red-500/20"
								>
									{deleteMut.isPending ? <Loader2 className="size-3 animate-spin" /> : "Confirm"}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setConfirmDelete(false)}
									className="h-7 px-2 text-[9px] font-mono uppercase text-[#71717a]"
								>
									Cancel
								</Button>
							</div>
						) : (
							<button
								type="button"
								onClick={() => setConfirmDelete(true)}
								disabled={anyPending}
								className="inline-flex items-center justify-center h-7 w-7 rounded-sm border border-white/8 text-[#52525b] hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-50"
							>
								<Trash2 className="size-3" />
							</button>
						))}
				</div>
			</div>
		</div>
	);
}

export default function AgentsTab() {
	const queryClient = useQueryClient();

	const agentsQuery = useQuery({
		queryKey: ["user-agents"],
		queryFn: getUserAgents,
		refetchInterval: 15_000,
	});

	const agents = agentsQuery.data || [];

	return (
		<>
			<div className="mt-6 h-fit w-full bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.06)]">
					<div className="flex items-center gap-2">
						<Bot className="size-4 text-[#00ff87]" />
						<h2 className="text-sm text-[#a1a1aa] font-semibold uppercase tracking-wider">Your Agents</h2>
						{agents.length > 0 && (
							<span className="text-[10px] font-mono text-[#52525b] bg-white/5 px-1.5 py-0.5 rounded-sm">
								{agents.length}
							</span>
						)}
					</div>
					{/* TODO(pivot-v2): create flow removed */}
				</div>

				{/* Content */}
				{agentsQuery.isLoading ? (
					<div className="flex items-center justify-center gap-2 p-8 text-xs text-[#71717a]">
						<Loader2 className="size-4 animate-spin text-[#00ff87]" />
						Loading agents…
					</div>
				) : agentsQuery.error ? (
					<div className="flex flex-col items-center gap-2 p-8 text-xs text-[#71717a]">
						<AlertCircle className="size-5 text-red-400" />
						<p>Failed to load agents.</p>
						<button
							type="button"
							onClick={() => agentsQuery.refetch()}
							className="text-[#00ff87] hover:underline font-mono uppercase text-[10px]"
						>
							Retry
						</button>
					</div>
				) : agents.length === 0 ? (
					<div className="flex flex-col items-center gap-3 p-8">
						<Bot className="size-8 text-[#52525b]" />
						<p className="text-sm text-[#71717a] text-center">You haven't deployed any agents yet.</p>
						<p className="text-xs text-[#52525b] text-center max-w-sm">
							Deploy an AI agent to engage with your community automatically across social platforms.
						</p>
					</div>
				) : (
					<div>
						{agents.map((agent) => (
							<AgentRow key={agent.agentId} agent={agent} />
						))}
					</div>
				)}
			</div>
		</>
	);
}
