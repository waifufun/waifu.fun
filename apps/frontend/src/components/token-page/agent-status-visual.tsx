"use client";

import type { IToken } from "@waifufun/types";
import { cn } from "@/lib/utils";
import { Activity, Clock, Import, Moon, Skull } from "lucide-react";

type AgentState = "bonding" | "active" | "dormant" | "imported";

function getAgentState(token: IToken): AgentState {
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const isBonded = token?.curveCompleted || curveProgress >= 100;
	const isImported = !!token?.imported;

	if (isImported) {
		const hasActivity = (token?.volume24h ?? 0) > 0;
		return hasActivity ? "active" : "imported";
	}

	if (!isBonded) return "bonding";

	const hasActivity = (token?.volume24h ?? 0) > 0 || (token?.marketcap ?? 0) > 0;
	if (!hasActivity) return "dormant";

	return "active";
}

const stateConfig: Record<
	AgentState,
	{
		label: string;
		description: string;
		icon: typeof Activity;
		className: string;
		iconClassName: string;
		pulse: boolean;
	}
> = {
	bonding: {
		label: "Bonding",
		description: "Bonding curve in progress — agent will activate when bonding completes.",
		icon: Clock,
		className: "bg-amber-500/10 border-amber-500/30 text-amber-200",
		iconClassName: "text-amber-400",
		pulse: false,
	},
	active: {
		label: "Active",
		description: "Agent is live and trading on-chain.",
		icon: Activity,
		className: "bg-emerald-500/10 border-emerald-500/30 text-emerald-200",
		iconClassName: "text-emerald-400",
		pulse: true,
	},
	dormant: {
		label: "Dormant",
		description: "Graduated but no recent trading activity detected.",
		icon: Moon,
		className: "bg-zinc-500/10 border-zinc-500/30 text-zinc-300",
		iconClassName: "text-zinc-400",
		pulse: false,
	},
	imported: {
		label: "Imported",
		description: "Token imported from an external source.",
		icon: Import,
		className: "bg-sky-500/10 border-sky-500/30 text-sky-200",
		iconClassName: "text-sky-400",
		pulse: false,
	},
};

export default function AgentStatusVisual({ token }: { token: IToken }) {
	const state = getAgentState(token);
	const config = stateConfig[state];
	const Icon = config.icon;

	return (
		<div
			className={cn(
				"flex items-center gap-4 rounded-lg border px-4 py-3",
				config.className,
			)}
			aria-label={`Agent status: ${config.label}`}
		>
			<div
				className={cn(
					"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-current/20",
					config.iconClassName,
				)}
			>
				<Icon className="h-5 w-5" aria-hidden />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-semibold uppercase tracking-wider text-sm">
					{config.label}
				</p>
				<p className="text-xs opacity-90 mt-0.5">
					{config.description}
				</p>
			</div>
			{config.pulse && (
				<span
					className="relative flex h-3 w-3 shrink-0"
					aria-hidden
				>
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
					<span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
				</span>
			)}
		</div>
	);
}
