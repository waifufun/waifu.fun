"use client";

import { Button } from "@/components/ui/button";
import { ApiError, getAgentByToken, restartAgent, stopAgent } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IToken } from "@waifufun/types";
import { AlertCircle, Bot, Loader2, Lock, RefreshCw, Square } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

/* ── status config ── */
const STATUS_CFG: Record<string, { label: string; dot: string; tone: string }> = {
	queued: { label: "queued", dot: "bg-sky-400", tone: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
	provisioning: {
		label: "provisioning",
		dot: "bg-sky-400 animate-pulse",
		tone: "border-sky-500/30 bg-sky-500/10 text-sky-300",
	},
	running: { label: "running", dot: "bg-[#00ff87]", tone: "border-[#00ff87]/30 bg-[#00ff87]/10 text-[#00ff87]" },
	stopped: { label: "stopped", dot: "bg-amber-400", tone: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
	failed: { label: "failed", dot: "bg-red-400", tone: "border-red-500/30 bg-red-500/10 text-red-300" },
	deleted: { label: "deleted", dot: "bg-zinc-400", tone: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300" },
	unknown: { label: "unknown", dot: "bg-zinc-400", tone: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300" },
};
const DEFAULT_CFG: { label: string; dot: string; tone: string } = {
	label: "unknown",
	dot: "bg-zinc-400",
	tone: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
};

/* ── platform icons (SVG inline, tiny) ── */
const PLATFORM_ICONS: Record<string, { icon: React.ReactNode; label: string }> = {
	twitter: {
		label: "Twitter",
		icon: (
			<svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-current">
				<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
			</svg>
		),
	},
	discord: {
		label: "Discord",
		icon: (
			<svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-current">
				<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
			</svg>
		),
	},
	telegram: {
		label: "Telegram",
		icon: (
			<svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-current">
				<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
			</svg>
		),
	},
	farcaster: {
		label: "Farcaster",
		icon: (
			<svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-current">
				<path d="M5.322 3h13.356v2.3l1.09.767H4.232l1.09-.768V3zm13.356 18H5.322v-2.3l-1.09-.767h15.536l-1.09.768V21zM18.678 7.615H5.322L4.232 9.23h15.536l-1.09-1.615zm0 2.77H5.322v5.23h13.356v-5.23z" />
			</svg>
		),
	},
};

type PublicAgentSnapshot = {
	hasAgent: boolean;
	status: string | null;
	lifecycle: string | null;
};

function getPublicAgentSnapshot(token: IToken): PublicAgentSnapshot {
	const publicToken = token as IToken & {
		hasAgent?: boolean;
		agentStatus?: string;
		agentLifecycleState?: string;
		cloudAgentId?: string;
		webUiUrl?: string;
	};
	const rawStatus = String(publicToken.agentStatus ?? "")
		.trim()
		.toLowerCase();
	const rawLifecycle = String(publicToken.agentLifecycleState ?? "")
		.trim()
		.toLowerCase();

	let status = rawStatus && rawStatus !== "none" ? rawStatus : null;
	if (status === "suspended") status = "stopped";

	if (!status) {
		if (rawLifecycle === "birth" || rawLifecycle === "reviving") status = "provisioning";
		if (rawLifecycle === "live") status = "running";
		if (rawLifecycle === "dormant") status = "stopped";
	}

	const hasAgent = Boolean(
		publicToken.hasAgent || publicToken.cloudAgentId || publicToken.webUiUrl || status || rawLifecycle,
	);
	return {
		hasAgent,
		status: hasAgent ? (status ?? "unknown") : null,
		lifecycle: rawLifecycle || null,
	};
}

function StatusBadge({ status }: { status: string }) {
	const cfg = STATUS_CFG[status] ?? DEFAULT_CFG;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em]",
				cfg.tone,
			)}
		>
			<span className={cn("size-1.5 rounded-full", cfg.dot)} />
			{cfg.label}
		</span>
	);
}

function PlatformRow({ platforms }: { platforms?: string[] | undefined }) {
	const all = Object.keys(PLATFORM_ICONS);
	return (
		<div className="flex items-center gap-2">
			{all.map((p) => {
				const active = platforms?.includes(p);
				const info = PLATFORM_ICONS[p];
				if (!info) return null;
				return (
					<span
						key={p}
						title={info.label}
						className={cn("flex items-center gap-1", active ? "text-[#e4e4e7]" : "text-[#3f3f46]")}
					>
						{info.icon}
						{active && <span className="size-1.5 rounded-full bg-[#00ff87]" />}
					</span>
				);
			})}
		</div>
	);
}

function ReadOnlyAgentPanel({
	snapshot,
	requiresCreatorAuth = false,
}: {
	snapshot: PublicAgentSnapshot;
	requiresCreatorAuth?: boolean;
}) {
	return (
		<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-3">
			<div className="flex items-center gap-2 flex-wrap">
				<Bot className="size-4 text-[#00ff87]" />
				{snapshot.status ? (
					<StatusBadge status={snapshot.status} />
				) : (
					<span className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-[#a1a1aa]">
						<Lock className="size-3" />
						creator-only
					</span>
				)}
				{snapshot.lifecycle && (
					<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">
						lifecycle: {snapshot.lifecycle}
					</span>
				)}
				<span className="ml-auto text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">public view</span>
			</div>
			<p className="mt-2 text-xs text-[#71717a]">
				{requiresCreatorAuth
					? "Finish creator auth to load restart and stop controls."
					: snapshot.hasAgent
						? "This token has a creator-managed runtime. Public viewers can see the status here, but controls stay private."
						: "Runtime controls live here for the creator after an agent is deployed."}
			</p>
		</div>
	);
}

export default function AgentPanel({ token, isCreator = false }: { token: IToken; isCreator?: boolean }) {
	const queryClient = useQueryClient();
	const publicAgent = useMemo(() => getPublicAgentSnapshot(token), [token]);

	const agentQuery = useQuery({
		queryKey: ["agent-by-token", token.contractAddress],
		queryFn: () => getAgentByToken(token.contractAddress),
		enabled: isCreator,
		refetchInterval: isCreator
			? (query) => {
					const s = query.state.data?.status;
					return s === "queued" || s === "provisioning" ? 5_000 : 30_000;
				}
			: false,
		retry: (failureCount, error) => !(error instanceof ApiError && error.status === 401) && failureCount < 1,
	});

	const agent = agentQuery.data;
	const authOnlyError = agentQuery.error instanceof ApiError && agentQuery.error.status === 401;
	const showReadOnlyPanel = !isCreator || authOnlyError;
	const refresh = () => queryClient.invalidateQueries({ queryKey: ["agent-by-token", token.contractAddress] });

	const restartMut = useMutation({
		mutationFn: () => {
			if (!agent?.agentId) throw new Error("No agent ID");
			return restartAgent(agent.agentId);
		},
		onSuccess: () => {
			toast.success("restart requested");
			refresh();
		},
		onError: (e: Error) => toast.error(e.message || "restart failed"),
	});

	const stopMut = useMutation({
		mutationFn: () => {
			if (!agent?.agentId) throw new Error("No agent ID");
			return stopAgent(agent.agentId);
		},
		onSuccess: () => {
			toast.success("agent stopped");
			refresh();
		},
		onError: (e: Error) => toast.error(e.message || "stop failed"),
	});

	const busy = restartMut.isPending || stopMut.isPending;

	/* ── public viewers / auth fallback ── */
	if (showReadOnlyPanel) {
		return <ReadOnlyAgentPanel snapshot={publicAgent} requiresCreatorAuth={authOnlyError} />;
	}

	/* ── loading ── */
	if (agentQuery.isLoading) {
		return (
			<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-3">
				<div className="flex items-center gap-2 text-xs text-[#71717a]">
					<Loader2 className="size-3.5 animate-spin text-[#00ff87]" />
					<span className="font-mono uppercase tracking-wider">checking agent…</span>
				</div>
			</div>
		);
	}

	/* ── error ── */
	if (agentQuery.error && !agent) {
		return (
			<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-3">
				<div className="flex items-center gap-2 text-xs text-[#71717a]">
					<AlertCircle className="size-3.5 text-red-400" />
					<span>could not check agent status.</span>
					<button
						type="button"
						onClick={refresh}
						className="text-[#00ff87] hover:underline font-mono uppercase text-[10px]"
					>
						retry
					</button>
				</div>
			</div>
		);
	}

	/* ── no agent: deploy prompt (creator) ── */
	if (!agent) {
		return (
			<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-3 flex items-center gap-3">
				<Bot className="size-4 text-[#00ff87] shrink-0" />
				<span className="text-xs text-[#71717a]">no agent running. delegated agents prepare launches via the api.</span>
			</div>
		);
	}

	/* ── owner management row ── */
	const canRestart = agent.status === "running" || agent.status === "stopped" || agent.status === "failed";
	const canStop = agent.status === "running";
	const isProvisioning = agent.status === "queued" || agent.status === "provisioning";

	return (
		<>
			<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-3 flex flex-col gap-3">
				{/* control row */}
				<div className="flex items-center gap-2 flex-wrap">
					<Bot className="size-4 shrink-0 text-[#00ff87]" />
					<StatusBadge status={agent.status} />
					<PlatformRow platforms={agent.platforms} />

					<div className="ml-auto flex items-center gap-1.5">
						{canRestart && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => restartMut.mutate()}
								disabled={busy}
								className="h-7 px-2 text-[10px] font-mono uppercase text-[#a1a1aa] hover:text-[#00ff87]"
							>
								{restartMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
								restart
							</Button>
						)}
						{canStop && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => stopMut.mutate()}
								disabled={busy}
								className="h-7 px-2 text-[10px] font-mono uppercase text-amber-300 hover:text-amber-200 border-amber-500/20"
							>
								{stopMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3" />}
								stop
							</Button>
						)}
						{isProvisioning && (
							<span className="flex items-center gap-1.5 text-[10px] font-mono text-sky-300">
								<Loader2 className="size-3 animate-spin" />
								provisioning…
							</span>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
