"use client";

import { Activity, Clock, Download, Moon } from "lucide-react";
import type { AgentLifecycleStatus } from "@/components/token-page/agent-profile";
import { cn } from "@/lib/utils";

const stateConfig = {
	bonding: {
		label: "Bonding",
		description: "Still on the bonding curve — graduation hasn’t happened yet.",
		icon: Clock,
		className: "bg-amber-500/10 border-amber-500/30 text-amber-200",
		iconClassName: "text-amber-400",
	},
	active: {
		label: "Active",
		description: "Graduated and showing recent market activity.",
		icon: Activity,
		className: "bg-[#00ff87]/10 border-[#00ff87]/30 text-emerald-100",
		iconClassName: "text-[#00ff87]",
	},
	dormant: {
		label: "Dormant",
		description: "Graduated, but currently showing little to no meaningful activity.",
		icon: Moon,
		className: "bg-zinc-500/10 border-zinc-500/30 text-zinc-200",
		iconClassName: "text-zinc-400",
	},
	imported: {
		label: "Imported",
		description: "Imported token discovered on waifu.fun.",
		icon: Download,
		className: "bg-sky-500/10 border-sky-500/30 text-sky-100",
		iconClassName: "text-[#60a5fa]",
	},
} as const;

export default function AgentStatusVisual({ status }: { status: AgentLifecycleStatus }) {
	const config = stateConfig[status.state];
	const Icon = config.icon;
	const description =
		status.state === "imported"
			? status.hasRecentActivity
				? "Imported token with current market activity on waifu.fun."
				: "Imported token with limited recent activity on waifu.fun."
			: config.description;

	return (
		<div
			className={cn("flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 rounded-sm border px-3 sm:px-4 py-3 min-w-0", config.className)}
			aria-label={`Agent status: ${config.label}`}
		>
			<div
				className={cn(
					"flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-sm border border-current/20 self-start sm:self-auto",
					config.iconClassName,
				)}
			>
				<Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-semibold uppercase tracking-wider text-xs sm:text-sm">{config.label}</p>
				<p className="text-[11px] sm:text-xs opacity-90 mt-0.5 line-clamp-2 sm:line-clamp-none">{description}</p>
			</div>
			{status.state === "active" && (
				<span className="relative flex h-3 w-3 shrink-0" aria-hidden>
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff87] opacity-60" />
					<span className="relative inline-flex h-3 w-3 rounded-full bg-[#00ff87] shadow-[0_0_10px_rgba(0,255,135,0.35)]" />
				</span>
			)}
		</div>
	);
}
