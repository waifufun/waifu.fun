"use client";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { formatNumber } from "@/lib/utils";
import { useTranslation } from "@/contexts/locale-context";
import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";

const DEFAULT_CURVE_LIMIT_BNB = 113;
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

function clampProgress(value: number) {
	return Math.min(100, Math.max(0, value));
}

function normalizeBnbAmount(value?: number) {
	if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
		return 0;
	}

	return value > 1_000_000 ? value / 1e18 : value;
}

function AnimatedProgressBar({ value, max }: { value: number; max: number }) {
	const [width, setWidth] = useState(0);
	const percentage = Math.min((value / max) * 100, 100);

	useEffect(() => {
		const timer = setTimeout(() => setWidth(percentage), 100);
		return () => clearTimeout(timer);
	}, [percentage]);

	return (
		<div className="relative">
			<div className="relative h-5 w-full overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(0,255,135,0.06)]">
				<motion.div
					className="absolute inset-y-0 left-0 rounded-sm bg-gradient-to-r from-[#065f46] via-[#00cc6d] to-[#00ff87]"
					initial={{ width: 0 }}
					animate={{ width: `${width}%` }}
					transition={{ duration: 1, ease: "easeOut" }}
				>
					<div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
				</motion.div>
				{width > 0 && (
					<motion.div
						className="absolute top-0 bottom-0 w-3"
						style={{ left: `calc(${width}% - 6px)` }}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 1 }}
					>
						<div className="absolute inset-y-0 right-0 w-3 animate-pulse bg-[#00ff87] blur-md" />
						<div className="absolute inset-y-0 right-0 w-1 bg-[#00ff87]" />
					</motion.div>
				)}
				<div className="absolute inset-0 flex">
					{PROGRESS_SEGMENTS.map((segment) => (
						<div key={segment} className="flex-1 border-r border-[rgba(255,255,255,0.03)] last:border-r-0" />
					))}
				</div>
			</div>
		</div>
	);
}

export default function BondingCurveProgress({
	token,
	title,
	showTooltip,
}: { token: IToken; title?: string; showTooltip?: boolean }) {
	const { t } = useTranslation();
	const tokenWithProgress = token as IToken & { progressPercent?: number };
	const rawProgress = token?.curveProgress ?? tokenWithProgress?.progressPercent;
	const curveProgress = typeof rawProgress === "number" ? clampProgress(rawProgress) : null;
	const isCurveComplete =
		token?.imported ||
		token?.curveCompleted ||
		curveProgress === null ||
		curveProgress >= 100 ||
		["migrated", "locked", "finalized"].includes(token?.status || "");

	if (isCurveComplete || curveProgress === null) return null;

	const currentReserveBnb = normalizeBnbAmount(token?.bondingCurveBalance);
	const curveLimitBnb = normalizeBnbAmount(token?.curveLimit) || DEFAULT_CURVE_LIMIT_BNB;
	const bnbRequiredForMigration = Math.max(0, curveLimitBnb - currentReserveBnb);

	return (
		<div className="relative">
			<div className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 animate-pulse rounded-full bg-[#00ff87] shadow-[0_0_8px_rgba(0,255,135,0.5)]" />
						<span className="font-mono text-[10px] uppercase tracking-wider text-[#52525b]">
							{title ?? t("token.bondingProgress")}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<motion.span
							className="font-mono text-sm font-bold text-[#00ff87]"
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
									<AlertCircle className="text-[#52525b] transition-colors hover:text-[#a1a1aa]" size={14} />
								</TooltipTrigger>
								<TooltipContent>
									<span className="text-xs">{t("token.bondingProgressTooltip")}</span>
								</TooltipContent>
							</Tooltip>
						)}
					</div>
				</div>
				<AnimatedProgressBar max={100} value={curveProgress} />
				{bnbRequiredForMigration > 0 && (
					<motion.div
						className="flex flex-wrap items-center gap-x-1 font-mono text-xs text-[#a1a1aa]"
						initial={{ opacity: 0, y: 5 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.5 }}
					>
						<span className="text-[#52525b]">{t("token.reserve")}:</span>
						<span className="text-[#00ff87]">{formatNumber(currentReserveBnb, true, true)} BNB</span>
						<span className="text-[#3f3f46]">•</span>
						<span className="text-[#52525b]">{t("token.needed")}:</span>
						<span className="text-[#e4e4e7]">{formatNumber(bnbRequiredForMigration, true, true)} BNB</span>
					</motion.div>
				)}
			</div>
			<div className="mt-4 h-[1px] w-full bg-[rgba(255,255,255,0.06)]" />
		</div>
	);
}
