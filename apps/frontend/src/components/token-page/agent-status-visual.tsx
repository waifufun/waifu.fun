"use client";

import type { AgentLifecycleStatus } from "@/components/token-page/agent-profile";
import { cn } from "@/lib/utils";
import { Activity, Clock, Download, Moon, Orbit } from "lucide-react";

const stateConfig = {
	bonding: {
		label: "bonding",
		description: "on the bonding curve. trade volume moves it toward graduation.",
		icon: Clock,
		className: "bg-amber-500/10 border-amber-500/30 text-amber-200",
		iconClassName: "text-amber-400",
	},
	active: {
		label: "active",
		description: "graduated and alive. recent trading activity detected.",
		icon: Activity,
		className: "bg-[#00ff87]/10 border-[#00ff87]/30 text-emerald-100",
		iconClassName: "text-[#00ff87]",
	},
	dormant: {
		label: "dormant",
		description: "graduated but quiet. no meaningful activity recently.",
		icon: Moon,
		className: "bg-zinc-500/10 border-zinc-500/30 text-zinc-200",
		iconClassName: "text-zinc-400",
	},
	imported: {
		label: "imported",
		description: "external token tracked on waifu.fun.",
		icon: Download,
		className: "bg-sky-500/10 border-sky-500/30 text-sky-100",
		iconClassName: "text-[#60a5fa]",
	},
	migrated: {
		label: "migrated",
		description: "liquidity has moved off the bonding curve and onto an external market.",
		icon: Orbit,
		className: "bg-violet-500/10 border-violet-500/30 text-violet-100",
		iconClassName: "text-violet-300",
	},
} as const;

export default function AgentStatusVisual({ status }: { status: AgentLifecycleStatus }) {
	const config = stateConfig[status.state];
	const Icon = config.icon;
	const description =
		status.state === "imported"
			? status.hasRecentActivity
				? "external token with current market activity on waifu.fun."
				: "external token tracked on waifu.fun."
			: status.state === "migrated"
				? status.hasRecentActivity
					? "liquidity migrated to an external pool and recent market activity is live."
					: "liquidity migrated off the bonding curve to an external pool."
				: config.description;

	return (
		<div
			className={cn(
				"flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 rounded-sm border px-3 sm:px-4 py-3 min-w-0",
				config.className,
			)}
			aria-label={`Agent status: ${config.label}`}
		>
			<div
				className={cn(
					"flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-sm border border-current/20 self-start sm:self-auto",
					config.iconClassName,
					(status.state === "active" || (status.isExternalMarket && status.hasRecentActivity)) && "animate-pulse",
				)}
			>
				<Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-semibold lowercase tracking-wider text-xs sm:text-sm">{config.label}</p>
				<p className="text-[11px] sm:text-xs opacity-90 mt-0.5 line-clamp-2 sm:line-clamp-none">{description}</p>
			</div>
			{(status.state === "active" || (status.isExternalMarket && status.hasRecentActivity)) && (
				<span className="relative flex h-3 w-3 shrink-0" aria-hidden>
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff87] opacity-60" />
					<span className="relative inline-flex h-3 w-3 rounded-full bg-[#00ff87] shadow-[0_0_10px_rgba(0,255,135,0.35)]" />
				</span>
			)}
		</div>
	);
}
