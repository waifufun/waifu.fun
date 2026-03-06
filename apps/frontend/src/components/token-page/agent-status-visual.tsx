"use client";

import type { IToken } from "@waifufun/types";
import { cn } from "@/lib/utils";
import { Activity, Moon, Skull } from "lucide-react";

function getAgentState(token: IToken) {
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const isBonded = token?.curveCompleted || curveProgress >= 100;
	const isDead =
		token?.status === "finalized" || (isBonded && (token?.marketcap ?? 0) === 0);

	if (isDead) return "dead" as const;
	if (isBonded) return "alive" as const;
	return "sleeping" as const;
}

const stateConfig = {
	sleeping: {
		label: "Not woken up yet",
		description: "Bonding curve in progress — agent will wake when bonding completes.",
		icon: Moon,
		className:
			"bg-amber-500/10 border-amber-500/30 text-amber-200",
		iconClassName: "text-amber-400",
	},
	alive: {
		label: "Alive",
		description: "Agent is running and trading.",
		icon: Activity,
		className:
			"bg-emerald-500/10 border-emerald-500/30 text-emerald-200",
		iconClassName: "text-emerald-400",
	},
	dead: {
		label: "Dead",
		description: "Agent has stopped — no remaining value or finalized.",
		icon: Skull,
		className:
			"bg-red-500/10 border-red-500/30 text-red-200",
		iconClassName: "text-red-400",
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
			{/* Pulse for alive */}
			{state === "alive" && (
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
