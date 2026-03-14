"use client";

import type { AgentLifecycleStatus } from "@/components/token-page/agent-profile";
import { cn, fromNow } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import { Activity, Clock, Radio, Zap } from "lucide-react";

type RuntimeToken = IToken & {
	lastHeartbeatAt?: string | Date | null;
	lastActivityAt?: string | Date | null;
};

const presenceConfig = {
	bonding: {
		label: "emerging",
		description: "still on the bonding curve",
		className: "border-amber-500/20 bg-amber-500/[0.04]",
		iconClassName: "text-amber-400",
		accentColor: "amber",
	},
	active: {
		label: "online",
		description: "active and responsive",
		className: "border-[#00ff87]/20 bg-[#00ff87]/[0.04]",
		iconClassName: "text-[#00ff87]",
		accentColor: "green",
	},
	dormant: {
		label: "idle",
		description: "graduated but quiet",
		className: "border-zinc-500/20 bg-zinc-500/[0.04]",
		iconClassName: "text-zinc-400",
		accentColor: "zinc",
	},
	imported: {
		label: "tracked",
		description: "external market listing",
		className: "border-sky-500/20 bg-sky-500/[0.04]",
		iconClassName: "text-sky-400",
		accentColor: "sky",
	},
	migrated: {
		label: "graduated",
		description: "trading on external pool",
		className: "border-emerald-500/20 bg-emerald-500/[0.04]",
		iconClassName: "text-emerald-400",
		accentColor: "green",
	},
} as const;

function PresenceSignal({ active, color }: { active: boolean; color: string }) {
	const colorMap: Record<string, string> = {
		green: "bg-[#00ff87]",
		amber: "bg-amber-400",
		zinc: "bg-zinc-400",
		sky: "bg-sky-400",
	};

	return (
		<span className="relative flex h-2 w-2">
			{active && (
				<span
					className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", colorMap[color])}
				/>
			)}
			<span className={cn("relative inline-flex h-2 w-2 rounded-full", colorMap[color])} />
		</span>
	);
}

function ActivityIndicator({
	label,
	value,
	icon: Icon,
	muted = false,
}: {
	label: string;
	value: string;
	icon: typeof Activity;
	muted?: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<Icon className={cn("size-3.5 shrink-0", muted ? "text-[#3f3f46]" : "text-[#52525b]")} />
			<div className="flex items-baseline gap-1.5 min-w-0">
				<span className={cn("text-[10px] font-mono uppercase tracking-wider", muted ? "text-[#3f3f46]" : "text-[#52525b]")}>
					{label}
				</span>
				<span className={cn("text-xs font-mono truncate", muted ? "text-[#52525b]" : "text-[#a1a1aa]")}>{value}</span>
			</div>
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
	const config = presenceConfig[status.state];
	const runtimeToken = token as RuntimeToken;
	const isLive = status.state === "active" || (status.isExternalMarket && status.hasRecentActivity);
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));

	// Activity signals
	const lastHeartbeat = runtimeToken.lastHeartbeatAt ? fromNow(runtimeToken.lastHeartbeatAt) : null;
	const lastActivity = runtimeToken.lastActivityAt ? fromNow(runtimeToken.lastActivityAt) : null;

	// Market context
	const marketFeed = status.isExternalMarket
		? marketDataSource === "dexscreener"
			? "live external"
			: "indexed"
		: "bonding curve";

	// Curve status for bonding state
	const curveStatus =
		status.state === "bonding" ? `${Math.round(curveProgress)}% complete` : status.hasCompletedBondingCurve ? "graduated" : null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.08, duration: 0.3 }}
			className={cn("rounded-sm border p-4 sm:p-5", config.className)}
		>
			<div className="flex flex-col gap-4">
				{/* Presence header */}
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-center gap-3 min-w-0">
						<PresenceSignal active={isLive} color={config.accentColor} />
						<div className="min-w-0">
							<div className="flex items-center gap-2">
								<span className={cn("text-sm font-semibold lowercase tracking-wide", config.iconClassName)}>
									{config.label}
								</span>
								<span className="text-xs text-current/70">{config.description}</span>
							</div>
						</div>
					</div>

					{/* Runtime mode badge */}
					<span className="shrink-0 rounded-sm border border-white/6 bg-white/[0.02] px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#71717a]">
						{marketFeed}
					</span>
				</div>

				{/* Activity signals - horizontal layout for compactness */}
				<div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
					<ActivityIndicator
						label="status"
						value={status.hasRecentActivity ? "recent activity" : "quiet"}
						icon={Activity}
					/>

					{lastHeartbeat ? (
						<ActivityIndicator label="heartbeat" value={lastHeartbeat} icon={Radio} />
					) : (
						<ActivityIndicator label="heartbeat" value="not exposed" icon={Radio} muted />
					)}

					{lastActivity ? (
						<ActivityIndicator label="last seen" value={lastActivity} icon={Clock} />
					) : curveStatus ? (
						<ActivityIndicator label="curve" value={curveStatus} icon={Zap} />
					) : (
						<ActivityIndicator label="last seen" value="unknown" icon={Clock} muted />
					)}

					<ActivityIndicator
						label="data"
						value={
							status.isExternalMarket
								? marketDataSource === "dexscreener"
									? "live feed"
									: "waiting for feed"
								: "platform data"
						}
						icon={Radio}
						muted={status.isExternalMarket && marketDataSource !== "dexscreener"}
					/>
				</div>
			</div>
		</motion.div>
	);
}
