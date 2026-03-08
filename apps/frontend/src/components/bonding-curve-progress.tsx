"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Rocket, Zap, Trophy, Target } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { formatNumber, cn } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
/** BNB has 18 decimals; 1 BNB = 1e18 wei */
const LAMPORTS_PER_SOL = 1e18;
import { motion } from "framer-motion";

function HudCorner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
	const base = "absolute w-2 h-2 pointer-events-none";
	const styles: Record<string, string> = {
		tl: `${base} top-0 left-0 border-t border-l border-[#00ff87]/30`,
		tr: `${base} top-0 right-0 border-t border-r border-[#00ff87]/30`,
		bl: `${base} bottom-0 left-0 border-b border-l border-[#00ff87]/30`,
		br: `${base} bottom-0 right-0 border-b border-r border-[#00ff87]/30`,
	};
	return <span className={styles[position]} />;
}

const MILESTONES = [
	{ percent: 25, icon: Zap, label: "ignition" },
	{ percent: 50, icon: Target, label: "halfway" },
	{ percent: 75, icon: Rocket, label: "liftoff" },
	{ percent: 100, icon: Trophy, label: "bonded" },
];

const PROGRESS_SEGMENTS = [
	"segment-1",
	"segment-2",
	"segment-3",
	"segment-4",
	"segment-5",
	"segment-6",
	"segment-7",
	"segment-8",
	"segment-9",
	"segment-10",
];

function AnimatedProgressBar({ value, max }: { value: number; max: number }) {
	const [width, setWidth] = useState(0);
	const percentage = Math.min((value / max) * 100, 100);
	useEffect(() => {
		const timer = setTimeout(() => setWidth(percentage), 100);
		return () => clearTimeout(timer);
	}, [percentage]);

	return (
		<div className="relative">
			<div className="absolute inset-0 flex items-center pointer-events-none z-10">
				{MILESTONES.map((milestone) => (
					<div
						key={milestone.percent}
						className="absolute flex flex-col items-center"
						style={{ left: `${milestone.percent}%`, transform: "translateX(-50%)" }}
					>
						<div
							className={cn(
								"w-0.5 h-5 -mt-0.5 rounded-full transition-colors duration-500",
								percentage >= milestone.percent ? "bg-[#00ff87]" : "bg-[rgba(255,255,255,0.1)]",
							)}
						/>
					</div>
				))}
			</div>
			<div className="relative h-5 w-full bg-[rgba(0,255,135,0.06)] rounded-sm overflow-hidden border border-[rgba(255,255,255,0.06)]">
				<motion.div
					className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#065f46] via-[#22c55e] to-[#00ff87] rounded-sm"
					initial={{ width: 0 }}
					animate={{ width: `${width}%` }}
					transition={{ duration: 1, ease: "easeOut" }}
				>
					<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
				</motion.div>
				{width > 0 && (
					<motion.div
						className="absolute top-0 bottom-0 w-3"
						style={{ left: `calc(${width}% - 6px)` }}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 1 }}
					>
						<div className="absolute inset-y-0 right-0 w-3 bg-[#00ff87] blur-md animate-pulse" />
						<div className="absolute inset-y-0 right-0 w-1 bg-[#00ff87]" />
					</motion.div>
				)}
				<div className="absolute inset-0 flex">
					{PROGRESS_SEGMENTS.map((segment) => (
						<div key={segment} className="flex-1 border-r border-[rgba(255,255,255,0.03)] last:border-r-0" />
					))}
				</div>
			</div>
			<div className="relative mt-2 flex justify-between px-1">
				{MILESTONES.map((milestone) => {
					const reached = percentage >= milestone.percent;
					const MilestoneIcon = milestone.icon;
					return (
						<Tooltip key={milestone.percent}>
							<TooltipTrigger asChild>
								<div
									className={cn(
										"flex items-center gap-1 cursor-default transition-all duration-300",
										reached ? "text-[#00ff87]" : "text-[#3f3f46]",
									)}
								>
									<MilestoneIcon className={cn("size-3", reached && "animate-pulse")} />
									<span className="text-[9px] font-mono uppercase hidden sm:inline">{milestone.label}</span>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<span className="text-xs">
									{milestone.percent}% — {milestone.label}
								</span>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</div>
	);
}

export default function BondingCurveProgress({
	token,
	title,
	showTooltip,
}: { token: IToken; title?: string; showTooltip?: boolean }) {
	const curveProgress = token?.curveProgress;
	if (typeof curveProgress !== "number" || token?.curveCompleted || token?.imported) return null;

	const currentReserveLamports = token?.bondingCurveBalance ? token.bondingCurveBalance * LAMPORTS_PER_SOL : 0;
	const curveLimitLamports = token?.curveLimit || 113 * LAMPORTS_PER_SOL;
	const solRequiredForMigration = Math.max(0, (curveLimitLamports - currentReserveLamports) / LAMPORTS_PER_SOL);

	return (
		<div className="relative">
			<HudCorner position="tl" />
			<HudCorner position="tr" />
			<HudCorner position="bl" />
			<HudCorner position="br" />
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-4 justify-between">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-[#00ff87] animate-pulse shadow-[0_0_8px_rgba(0,255,135,0.5)]" />
						<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">
							{title ? title : "bonding progress"}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<motion.span
							className="text-sm font-bold text-[#00ff87] font-mono"
							key={curveProgress}
							initial={{ scale: 1.2, opacity: 0.5 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={{ duration: 0.3 }}
						>
							{curveProgress.toFixed(2)}%
						</motion.span>
						{showTooltip && (
							<Tooltip>
								<TooltipTrigger>
									<AlertCircle className="text-[#52525b] hover:text-[#a1a1aa] transition-colors" size={14} />
								</TooltipTrigger>
								<TooltipContent>
									<span className="text-xs">
										when the market cap reaches the graduation threshold,
										<br />
										the coin&apos;s liquidity will migrate to a DEX.
									</span>
								</TooltipContent>
							</Tooltip>
						)}
					</div>
				</div>
				<AnimatedProgressBar max={100} value={Number(curveProgress.toFixed(2))} />
				{solRequiredForMigration > 0 && (
					<motion.div
						className="flex flex-wrap items-center gap-x-1 text-xs text-[#a1a1aa] font-mono"
						initial={{ opacity: 0, y: 5 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.5 }}
					>
						<span className="text-[#52525b]">reserve:</span>
						<span className="text-[#00ff87]">
							{formatNumber(Number(currentReserveLamports / LAMPORTS_PER_SOL), false, true)} SOL
						</span>
						<span className="text-[#3f3f46]">•</span>
						<span className="text-[#52525b]">needed:</span>
						<span className="text-[#c084fc]">{formatNumber(solRequiredForMigration, true, true)} SOL</span>
					</motion.div>
				)}
			</div>
			<div className="h-[1px] w-full bg-[rgba(255,255,255,0.06)] mt-4" />
		</div>
	);
}
