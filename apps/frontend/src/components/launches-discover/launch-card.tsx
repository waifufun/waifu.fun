/**
 * Launch card used by /launches and the live-launches rail on the landing
 * page. Compact, scannable, action-oriented.
 *
 * Variants:
 *  - `default`: full card with image, name, ticker, tier, progress, deposits.
 *  - `compact`: rail-friendly, hides description and trims padding.
 */
import { Users } from "lucide-react";
import Link from "next/link";

import { LaunchCountdown } from "@/components/launch-page/launch-countdown";
import {
	type LaunchListItem,
	getLaunchImage,
	getLaunchName,
	getLaunchSymbol,
	progressPct,
	safeBigInt,
} from "@/lib/api/launches-list";
import { cn } from "@/lib/utils";

type Props = {
	launch: LaunchListItem;
	variant?: "default" | "compact";
};

const STATE_BADGE: Record<string, string> = {
	open: "border-[#00ff87]/40 text-[#00ff87] bg-[#00ff87]/[0.05]",
	closed: "border-yellow-400/40 text-yellow-300 bg-yellow-400/5",
	launched: "border-blue-400/40 text-blue-300 bg-blue-400/5",
	failed: "border-red-400/40 text-red-300 bg-red-400/5",
};

const STATE_DOT: Record<string, string> = {
	open: "bg-[#00ff87] animate-pulse",
	closed: "bg-yellow-300",
	launched: "bg-blue-300",
	failed: "bg-red-300",
};

export function LaunchCard({ launch, variant = "default" }: Props) {
	const compact = variant === "compact";
	const name = getLaunchName(launch);
	const symbol = getLaunchSymbol(launch);
	const image = getLaunchImage(launch);

	const deposited = safeBigInt(launch.totalDeposited);
	const cap = safeBigInt(launch.capacity);
	const pct = progressPct(deposited, cap);

	const stateClass = STATE_BADGE[launch.state] ?? "border-white/15 text-white/60 bg-white/5";
	const dotClass = STATE_DOT[launch.state] ?? "bg-white/40";

	return (
		<Link
			href={`/launch/${encodeURIComponent(launch.id)}`}
			className={cn(
				"group relative flex flex-col border border-white/10 bg-[#08080a] rounded-sm overflow-hidden transition-colors duration-150 ease-out",
				"hover:border-[#00ff87]/30 hover:bg-[#0a0a0c] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00ff87]/40",
			)}
		>
			<div className={cn("flex items-start gap-3", compact ? "p-3" : "p-4")}>
				<LaunchAvatar image={image} compact={compact} />

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className={cn("text-white truncate", compact ? "text-sm" : "text-base")}>{name}</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">${symbol}</span>
					</div>
					<div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
						<span
							className={cn(
								"inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm border text-[9px] font-mono uppercase tracking-[0.2em]",
								stateClass,
							)}
						>
							<span className={cn("w-1 h-1 rounded-full", dotClass)} />
							{launch.state}
						</span>
						{launch.tier ? (
							<span className="inline-flex items-center px-1.5 py-0.5 rounded-sm border border-white/10 text-[9px] font-mono uppercase tracking-[0.2em] text-white/55">
								tier {launch.tier}
							</span>
						) : null}
						{launch.depositorCount !== undefined && launch.depositorCount > 0 ? (
							<span className="inline-flex items-center gap-1 text-[10px] text-white/45">
								<Users className="w-2.5 h-2.5" strokeWidth={1.5} />
								{launch.depositorCount}
							</span>
						) : null}
					</div>
				</div>
			</div>

			{/* progress + countdown bar */}
			{launch.state === "open" ? (
				<div className={cn("mt-auto px-4 pb-3 pt-1", compact && "px-3 pb-2.5")}>
					<div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-white/45 mb-1.5">
						<span className="tabular-nums">{pct.toFixed(1)}% raised</span>
						<LaunchCountdown
							closeTimestampSec={launch.closeTimestamp ?? null}
							compact
							className="tabular-nums text-white/55"
						/>
					</div>
					<div className="h-1 w-full overflow-hidden border border-white/10 bg-[#111114] rounded-sm">
						<div className="h-full bg-[#00ff87] transition-[width] duration-500" style={{ width: `${pct}%` }} />
					</div>
				</div>
			) : (
				<div className={cn("mt-auto px-4 pb-3", compact && "px-3 pb-2.5")}>
					<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">
						{launch.state === "launched"
							? "live on dex"
							: launch.state === "closed"
								? "awaiting bundle"
								: launch.state === "failed"
									? "refundable"
									: "view details"}
					</div>
				</div>
			)}
		</Link>
	);
}

function LaunchAvatar({ image, compact }: { image: string | null; compact: boolean }) {
	const size = compact ? "w-10 h-10" : "w-12 h-12";
	if (image) {
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img
				src={image}
				alt=""
				className={cn(size, "shrink-0 rounded-sm border border-white/10 object-cover bg-black/40")}
			/>
		);
	}
	return (
		<div
			className={cn(
				size,
				"shrink-0 rounded-sm border border-white/10 bg-[#0a0a0c] flex items-center justify-center text-[9px] font-mono text-white/30 uppercase tracking-[0.18em]",
			)}
		>
			no logo
		</div>
	);
}

export function LaunchCardSkeleton({ variant = "default" }: { variant?: "default" | "compact" }) {
	const compact = variant === "compact";
	return (
		<div className="flex flex-col border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			<div className={cn("flex items-start gap-3 relative overflow-hidden", compact ? "p-3" : "p-4")}>
				<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
				<div className={cn("shrink-0 rounded-sm bg-white/5", compact ? "w-10 h-10" : "w-12 h-12")} />
				<div className="flex-1 min-w-0 space-y-2">
					<div className="h-3 w-2/3 bg-white/10 rounded-sm" />
					<div className="h-2 w-1/3 bg-white/5 rounded-sm" />
					<div className="flex gap-1.5 mt-2">
						<div className="h-3 w-12 bg-white/5 rounded-sm" />
						<div className="h-3 w-14 bg-white/5 rounded-sm" />
					</div>
				</div>
			</div>
			<div className={cn("px-4 pb-3", compact && "px-3 pb-2.5")}>
				<div className="h-1 w-full bg-white/5 rounded-sm" />
			</div>
		</div>
	);
}

export default LaunchCard;
