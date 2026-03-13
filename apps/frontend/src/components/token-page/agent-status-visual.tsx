"use client";

import type { AgentLifecycleStatus } from "@/components/token-page/agent-profile";
import { cn } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { Activity, Clock, Download, Moon, Orbit, RadioTower, Waves } from "lucide-react";

const stateConfig = {
	bonding: {
		label: "bonding",
		title: "still on the bonding curve",
		description: "This token is still graduating. Trading activity pushes it toward launch readiness.",
		icon: Clock,
		className: "bg-amber-500/10 border-amber-500/30 text-amber-200",
		iconClassName: "text-amber-400",
	},
	active: {
		label: "active",
		title: "trading and responsive",
		description: "Recent market activity is present, so the token currently reads as live.",
		icon: Activity,
		className: "bg-[#00ff87]/10 border-[#00ff87]/30 text-emerald-100",
		iconClassName: "text-[#00ff87]",
	},
	dormant: {
		label: "dormant",
		title: "graduated but quiet",
		description: "The token has cleared bonding, but current activity is too light to call it live.",
		icon: Moon,
		className: "bg-zinc-500/10 border-zinc-500/30 text-zinc-200",
		iconClassName: "text-zinc-400",
	},
	imported: {
		label: "imported",
		title: "tracked from an external market",
		description: "This token originated elsewhere and is being represented on waifu.fun with the best available data.",
		icon: Download,
		className: "bg-sky-500/10 border-sky-500/30 text-sky-100",
		iconClassName: "text-[#60a5fa]",
	},
	migrated: {
		label: "migrated",
		title: "moved off the bonding curve",
		description:
			"Liquidity has moved to an external pool, so status is based on external-market context instead of curve progress.",
		icon: Orbit,
		className: "bg-violet-500/10 border-violet-500/30 text-violet-100",
		iconClassName: "text-violet-300",
	},
} as const;

function DetailTile({
	label,
	value,
	icon: Icon,
}: {
	label: string;
	value: string;
	icon: typeof Activity;
}) {
	return (
		<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] px-3 py-2.5 min-w-0">
			<div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#71717a]">
				<Icon className="size-3 text-[#52525b] shrink-0" />
				<span>{label}</span>
			</div>
			<p className="mt-1 text-xs text-[#e4e4e7] leading-relaxed break-words">{value}</p>
		</div>
	);
}

export default function AgentStatusVisual({
	status,
	token,
	marketDataSource,
}: {
	status: AgentLifecycleStatus;
	token: IToken;
	marketDataSource?: "dexscreener" | null;
}) {
	const config = stateConfig[status.state];
	const Icon = config.icon;
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const hasLiveExternalMarketData = marketDataSource === "dexscreener";
	const isLiveSignal = status.state === "active" || (status.isExternalMarket && status.hasRecentActivity);
	const activitySummary = status.hasRecentActivity
		? "Recent trading activity detected."
		: status.state === "bonding"
			? "No confirmed trading signal yet — still early in the curve lifecycle."
			: "No recent trading signal detected from the current dataset.";
	const marketSummary = status.isExternalMarket
		? hasLiveExternalMarketData
			? "Live external market feed connected."
			: "Using indexed fallback data until the live external market feed is available."
		: status.isBonded
			? "Using waifu.fun lifecycle data after curve completion."
			: `Using bonding-curve state (${Math.round(curveProgress)}% complete).`;
	const liquiditySummary = status.isImported
		? "Imported listing — not launched from this bonding curve."
		: status.state === "migrated"
			? "Liquidity has moved to an external pool."
			: status.isBonded
				? "Bonding curve completed."
				: `${Math.round(curveProgress)}% of the bonding curve completed.`;
	const helperCopy =
		status.isExternalMarket && !hasLiveExternalMarketData
			? "This panel is intentionally showing the best known lifecycle state instead of a dead loading placeholder."
			: "Status is derived from token lifecycle plus the market activity currently available to the page.";

	return (
		<div
			className={cn("rounded-sm border bg-[#111114] p-4 sm:p-5 min-w-0 overflow-hidden", config.className)}
			aria-label={`Agent status: ${config.label}`}
		>
			<div className="flex flex-col gap-4 min-w-0">
				<div className="flex items-start justify-between gap-3 min-w-0">
					<div className="flex items-start gap-3 min-w-0 flex-1">
						<div
							className={cn(
								"flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-current/20 bg-[#08080a]",
								config.iconClassName,
								isLiveSignal && "shadow-[0_0_18px_rgba(0,255,135,0.12)]",
							)}
						>
							<Icon className="h-5 w-5" aria-hidden />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2 flex-wrap">
								<p className="font-semibold lowercase tracking-wider text-sm sm:text-base text-[#f4f4f5]">
									{config.title}
								</p>
								<span className="rounded-sm border border-current/20 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em]">
									{config.label}
								</span>
							</div>
							<p className="text-xs sm:text-sm text-current/90 mt-1 leading-relaxed">{config.description}</p>
							<p className="text-[11px] text-current/75 mt-2 leading-relaxed">{helperCopy}</p>
						</div>
					</div>

					{isLiveSignal && (
						<span className="relative flex h-3 w-3 shrink-0 mt-1" aria-hidden>
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00ff87] opacity-60" />
							<span className="relative inline-flex h-3 w-3 rounded-full bg-[#00ff87] shadow-[0_0_10px_rgba(0,255,135,0.35)]" />
						</span>
					)}
				</div>

				<div className="grid gap-2 sm:grid-cols-3 min-w-0 text-[#e4e4e7]">
					<DetailTile label="activity" value={activitySummary} icon={Activity} />
					<DetailTile label="market feed" value={marketSummary} icon={RadioTower} />
					<DetailTile label="liquidity" value={liquiditySummary} icon={Waves} />
				</div>
			</div>
		</div>
	);
}
