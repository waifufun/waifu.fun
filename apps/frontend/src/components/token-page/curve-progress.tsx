"use client";

import { motion, useInView } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Flame } from "lucide-react";
import { useMemo, useRef } from "react";

interface CurveProgressProps {
	waifuBonded: string;
	curveLimit: string;
	isGraduated: boolean;
	pancakeswapPair?: string;
}

export default function CurveProgress({ waifuBonded, curveLimit, isGraduated, pancakeswapPair }: CurveProgressProps) {
	const ref = useRef(null);
	const inView = useInView(ref, { once: true, margin: "-40px" });

	const progress = useMemo(() => {
		const bonded = Number(waifuBonded);
		const limit = Number(curveLimit);
		if (limit <= 0) return 0;
		return Math.min((bonded / limit) * 100, 100);
	}, [waifuBonded, curveLimit]);

	const formatNumber = (val: string) => {
		const n = Number(val);
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return n.toFixed(0);
	};

	return (
		<div ref={ref} className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-5">
			<div className="flex items-center justify-between mb-4">
				<div className="flex items-center gap-2">
					{isGraduated ? (
						<CheckCircle2 className="w-3.5 h-3.5 text-[#00ff87]" strokeWidth={1.5} />
					) : (
						<Flame className="w-3.5 h-3.5 text-[#f59e0b]" strokeWidth={1.5} />
					)}
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#52525b]">
						{isGraduated ? "graduated" : "bonding curve"}
					</span>
				</div>
				{isGraduated && pancakeswapPair && (
					<a
						href={`https://pancakeswap.finance/swap?outputCurrency=${pancakeswapPair}`}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1 font-mono text-[10px] text-[#00ff87] hover:underline"
					>
						trade on PancakeSwap
						<ArrowUpRight className="w-3 h-3" />
					</a>
				)}
			</div>

			{/* Progress bar */}
			<div className="relative h-2 rounded-full bg-[#1a1a1e] overflow-hidden mb-3">
				<motion.div
					className="absolute inset-y-0 left-0 rounded-full"
					style={{
						background: isGraduated ? "#00ff87" : "linear-gradient(90deg, #00ff87, #22c55e)",
					}}
					initial={{ width: "0%" }}
					animate={inView ? { width: `${progress}%` } : {}}
					transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
				/>
				{!isGraduated && progress > 0 && (
					<motion.div
						className="absolute inset-y-0 rounded-full bg-[#00ff87]/20"
						animate={{ opacity: [0.3, 0.6, 0.3] }}
						transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
						style={{ width: `${progress}%` }}
					/>
				)}
			</div>

			{/* Numbers */}
			<div className="flex items-center justify-between">
				<div>
					<span className="font-mono text-lg font-bold text-[#e4e4e7]">{formatNumber(waifuBonded)}</span>
					<span className="font-mono text-xs text-[#3f3f46] ml-1">/ {formatNumber(curveLimit)} WAIFU</span>
				</div>
				<span className={`font-mono text-sm font-bold ${isGraduated ? "text-[#00ff87]" : "text-[#a1a1aa]"}`}>
					{isGraduated ? "100%" : `${progress.toFixed(1)}%`}
				</span>
			</div>

			{!isGraduated && (
				<p className="mt-2 font-mono text-[10px] text-[#3f3f46]">
					{(100 - progress).toFixed(1)}% until PancakeSwap graduation
				</p>
			)}
		</div>
	);
}
