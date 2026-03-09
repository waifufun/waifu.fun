"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	getAgentByToken,
	restartAgent,
	stopAgent,
	type AgentStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import {
	Bot,
	ExternalLink,
	RefreshCw,
	Square,
	Loader2,
	AlertCircle,
	Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DeployAgentModal } from "@/components/ui/create-token/deploy-agent-modal";

const statusConfig: Record<
	string,
	{ label: string; toneClass: string; dotClass: string }
> = {
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

function HudCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
	const base = "absolute h-2.5 w-2.5 pointer-events-none";
	const styles: Record<typeof position, string> = {
		tl: `${base} left-0 top-0 border-l border-t border-[#00ff87]/35`,
		tr: `${base} right-0 top-0 border-r border-t border-[#00ff87]/35`,
		bl: `${base} bottom-0 left-0 border-b border-l border-[#00ff87]/35`,
		br: `${base} bottom-0 right-0 border-b border-r border-[#00ff87]/35`,
	};
	return <span className={styles[position]} />;
}

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
				"inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em]",
				config.toneClass,
			)}
		>
			<span
				className={cn("size-1.5 rounded-full", config.dotClass)}
			/>
			{config.label}
		</span>
	);
}

export default function AgentPanel({ token }: { token: IToken }) {
	const queryClient = useQueryClient();
	const [deployModalOpen, setDeployModalOpen] = useState(false);

	const agentQuery = useQuery({
		queryKey: ["agent-by-token", token.contractAddress],
		queryFn: () => getAgentByToken(token.contractAddress),
		refetchInterval: (query) => {
			const data = query.state.data;
			if (
				data?.status === "queued" ||
				data?.status === "provisioning"
			) {
				return 5_000;
			}
			return 30_000;
		},
		retry: 1,
	});

	const agent = agentQuery.data;

	const refreshAgent = () => {
		queryClient.invalidateQueries({
			queryKey: ["agent-by-token", token.contractAddress],
		});
	};

	const restartMutation = useMutation({
		mutationFn: () => {
			if (!agent?.agentId) throw new Error("No agent ID");
			return restartAgent(agent.agentId);
		},
		onSuccess: () => {
			toast.success("Agent restart requested");
			refreshAgent();
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to restart agent");
		},
	});

	const stopMutation = useMutation({
		mutationFn: () => {
			if (!agent?.agentId) throw new Error("No agent ID");
			return stopAgent(agent.agentId);
		},
		onSuccess: () => {
			toast.success("Agent stopped");
			refreshAgent();
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to stop agent");
		},
	});

	const anyPending =
		restartMutation.isPending || stopMutation.isPending;

	// Loading state
	if (agentQuery.isLoading) {
		return (
			<div className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4">
				<div className="flex items-center gap-2 text-xs text-[#71717a]">
					<Loader2 className="size-3.5 animate-spin text-[#00ff87]" />
					<span className="font-mono uppercase tracking-wider">
						Checking agent status…
					</span>
				</div>
			</div>
		);
	}

	// Error state
	if (agentQuery.error && !agent) {
		return (
			<div className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4">
				<div className="flex items-center gap-2 text-xs text-[#71717a]">
					<AlertCircle className="size-3.5 text-red-400" />
					<span>Could not check agent status.</span>
					<button
						type="button"
						onClick={refreshAgent}
						className="text-[#00ff87] hover:underline font-mono uppercase text-[10px]"
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	// No agent — show deploy prompt
	if (!agent) {
		return (
			<>
				<div className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 transition-colors hover:border-[rgba(255,255,255,0.12)]">
					<HudCorner position="tl" />
					<HudCorner position="tr" />
					<HudCorner position="bl" />
					<HudCorner position="br" />

					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<Bot className="size-4 text-[#00ff87]" />
								<h3 className="text-xs font-mono uppercase tracking-[0.18em] text-[#e4e4e7]">
									AI Agent
								</h3>
							</div>
							<p className="text-xs text-[#71717a]">
								No agent is linked to this token yet. Deploy
								one to engage your community automatically.
							</p>
						</div>
						<Button
							onClick={() => setDeployModalOpen(true)}
							className="h-9 px-4 text-[11px] font-mono uppercase shrink-0"
						>
							<Sparkles className="size-3.5" />
							Deploy Agent
						</Button>
					</div>
				</div>

				<DeployAgentModal
					open={deployModalOpen}
					onOpenChange={(v) => {
						setDeployModalOpen(v);
						if (!v) refreshAgent();
					}}
					tokenName={token.name}
					tokenDescription={token.description}
					tokenAddress={token.contractAddress}
				/>
			</>
		);
	}

	// Agent exists — show management panel
	return (
		<>
			<div className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-3 sm:p-4 transition-colors hover:border-[rgba(255,255,255,0.12)]">
				<HudCorner position="tl" />
				<HudCorner position="tr" />
				<HudCorner position="bl" />
				<HudCorner position="br" />

				<div className="flex flex-col gap-3">
					{/* Header row */}
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
						<div className="flex items-center gap-2 min-w-0">
							<Bot className="size-4 shrink-0 text-[#00ff87]" />
							<h3 className="text-xs font-mono uppercase tracking-[0.18em] text-[#e4e4e7] truncate">
								{agent.agentName || "AI Agent"}
							</h3>
							<StatusPill status={agent.status} />
						</div>
						<Button
							variant="outline"
							size="sm"
							className="h-7 px-2 text-[10px] font-mono uppercase text-[#a1a1aa] hover:text-[#00ff87]"
							onClick={refreshAgent}
							disabled={anyPending}
						>
							<RefreshCw className="size-3" />
							Refresh
						</Button>
					</div>

					{/* Agent details */}
					<div className="grid gap-2 md:grid-cols-2">
						<div className="rounded-sm border border-white/6 bg-[#08080a] px-3 py-2">
							<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">
								Agent ID
							</p>
							<p className="mt-0.5 text-xs font-mono text-[#e4e4e7] truncate">
								{agent.agentId}
							</p>
						</div>
						<div className="rounded-sm border border-white/6 bg-[#08080a] px-3 py-2">
							<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">
								Status
							</p>
							<p className="mt-0.5 text-xs text-[#e4e4e7] capitalize">
								{agent.status}
							</p>
						</div>
					</div>

					{/* Platforms */}
					{agent.platforms && agent.platforms.length > 0 && (
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">
								Platforms:
							</span>
							{agent.platforms.map((p) => (
								<span
									key={p}
									className="inline-flex items-center rounded-sm border border-white/8 bg-white/3 px-2 py-0.5 text-[10px] font-mono uppercase text-[#a1a1aa]"
								>
									{p}
								</span>
							))}
						</div>
					)}

					{/* Web UI link */}
					{agent.containerUrl && (
						<a
							href={agent.containerUrl}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-[0.16em] text-[#00ff87] hover:text-[#7dffc1] transition-colors"
						>
							<ExternalLink className="size-3.5" />
							Open Agent UI
						</a>
					)}

					{/* Actions */}
					<div className="flex flex-wrap gap-2 pt-1">
						{agent.status === "running" && (
							<>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										restartMutation.mutate()
									}
									disabled={anyPending}
									className="h-8 px-3 text-[10px] font-mono uppercase text-[#a1a1aa] hover:text-[#00ff87]"
								>
									{restartMutation.isPending ? (
										<Loader2 className="size-3 animate-spin" />
									) : (
										<RefreshCw className="size-3" />
									)}
									Restart
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										stopMutation.mutate()
									}
									disabled={anyPending}
									className="h-8 px-3 text-[10px] font-mono uppercase text-amber-300 hover:text-amber-200 border-amber-500/20"
								>
									{stopMutation.isPending ? (
										<Loader2 className="size-3 animate-spin" />
									) : (
										<Square className="size-3" />
									)}
									Stop
								</Button>
							</>
						)}

						{(agent.status === "stopped" ||
							agent.status === "failed") && (
							<Button
								size="sm"
								onClick={() =>
									restartMutation.mutate()
								}
								disabled={anyPending}
								className="h-8 px-3 text-[10px] font-mono uppercase"
							>
								{restartMutation.isPending ? (
									<Loader2 className="size-3 animate-spin" />
								) : (
									<RefreshCw className="size-3" />
								)}
								Restart Agent
							</Button>
						)}

						{(agent.status === "queued" ||
							agent.status === "provisioning") && (
							<div className="flex items-center gap-2 rounded-sm border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-200/90">
								<Loader2 className="size-3 animate-spin" />
								Agent is being provisioned…
							</div>
						)}
					</div>
				</div>
			</div>

			<DeployAgentModal
				open={deployModalOpen}
				onOpenChange={(v) => {
					setDeployModalOpen(v);
					if (!v) refreshAgent();
				}}
				tokenName={token.name}
				tokenDescription={token.description}
				tokenAddress={token.contractAddress}
			/>
		</>
	);
}
