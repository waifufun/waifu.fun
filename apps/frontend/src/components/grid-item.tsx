"use client";
import type { IToken } from "@waifufun/types";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

function formatMarketCap(mc: number): string {
	if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}m`;
	if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}k`;
	return `$${mc}`;
}

function truncateDescription(desc: string | undefined, maxLen: number): string {
	if (!desc) return "";
	if (desc.length <= maxLen) return desc;
	return desc.slice(0, maxLen).trimEnd() + "…";
}

export const GridItem = ({
	token,
	variant = "medium",
	rank,
}: {
	token: IToken;
	variant?: "large" | "medium" | "compact";
	rank?: number;
}) => {
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const isBonded = token?.curveCompleted || curveProgress >= 100;
	const isDead = token?.status === "finalized" || (isBonded && token?.marketcap === 0);
	
	const isLarge = variant === "large";
	const isCompact = variant === "compact";

	// Image heights by variant
	const imageHeight = isLarge ? "h-[300px] sm:h-[360px]" : isCompact ? "h-[200px]" : "h-[240px] sm:h-[280px]";
	const descMaxLen = isLarge ? 100 : isCompact ? 50 : 72;

	// Show rank indicator for top 5
	const showRank = rank !== undefined && rank <= 5;

	return (
		<Link
			href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
			className="block h-full group"
		>
			<motion.div
				className="relative flex flex-col h-full rounded-sm overflow-hidden bg-[#111114] border border-[rgba(255,255,255,0.06)]"
				initial={{ opacity: 1, y: 0 }}
				whileHover={{
					y: -6,
					boxShadow: "0 0 40px rgba(0,255,135,0.1), 0 12px 40px rgba(0,0,0,0.5)",
					borderColor: "rgba(0,255,135,0.25)",
				}}
				style={{ willChange: "transform" }}
			>
				{/* HUD corner accents */}
				<div className="absolute top-0 left-0 w-10 h-10 pointer-events-none z-10 opacity-40 group-hover:opacity-100 transition-opacity">
					<div className="absolute top-2 left-2 w-5 h-px bg-gradient-to-r from-[#00ff87] to-transparent" />
					<div className="absolute top-2 left-2 w-px h-5 bg-gradient-to-b from-[#00ff87] to-transparent" />
				</div>
				<div className="absolute top-0 right-0 w-10 h-10 pointer-events-none z-10 opacity-40 group-hover:opacity-100 transition-opacity">
					<div className="absolute top-2 right-2 w-5 h-px bg-gradient-to-l from-[#00ff87] to-transparent" />
					<div className="absolute top-2 right-2 w-px h-5 bg-gradient-to-b from-[#00ff87] to-transparent" />
				</div>
				<div className="absolute bottom-0 left-0 w-10 h-10 pointer-events-none z-10 opacity-40 group-hover:opacity-100 transition-opacity">
					<div className="absolute bottom-2 left-2 w-5 h-px bg-gradient-to-r from-[#00ff87] to-transparent" />
					<div className="absolute bottom-2 left-2 w-px h-5 bg-gradient-to-t from-[#00ff87] to-transparent" />
				</div>
				<div className="absolute bottom-0 right-0 w-10 h-10 pointer-events-none z-10 opacity-40 group-hover:opacity-100 transition-opacity">
					<div className="absolute bottom-2 right-2 w-5 h-px bg-gradient-to-l from-[#00ff87] to-transparent" />
					<div className="absolute bottom-2 right-2 w-px h-5 bg-gradient-to-t from-[#00ff87] to-transparent" />
				</div>

				{/* Image area - 70%+ of card */}
				<div className={`relative w-full overflow-hidden ${imageHeight}`}>
					<motion.div
						className="absolute inset-0"
						whileHover={{ scale: 1.08 }}
						transition={{ duration: 0.6, ease: "easeOut" }}
					>
						<Image
							src={token.image}
							fill
							unoptimized
							alt={token.name}
							className="object-cover object-top"
						/>
					</motion.div>

					{/* Gradient overlay */}
					<div className="absolute inset-0 bg-gradient-to-t from-[rgba(17,17,20,1)] via-[rgba(17,17,20,0.2)] to-transparent" />

					{/* Rank badge (trending indicator) */}
					{showRank && (
						<div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[rgba(17,17,20,0.85)] border border-[rgba(0,255,135,0.25)]">
							<span className="text-xs">🔥</span>
							<span className="text-[10px] font-mono font-bold text-[#00ff87]">
								#{rank}
							</span>
						</div>
					)}

					{/* Status badges - top right */}
					<div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
						{isDead && (
							<div className="px-2.5 py-1 rounded-full bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)]">
								<span className="text-[10px] font-mono uppercase tracking-wider text-red-400">
									inactive
								</span>
							</div>
						)}
						{isBonded && !isDead && (
							<div className="px-2.5 py-1 rounded-full bg-[rgba(0,255,135,0.1)] border border-[rgba(0,255,135,0.3)]">
								<span className="text-[10px] font-mono uppercase tracking-wider text-[#00ff87]">
									bonded
								</span>
							</div>
						)}
						{!isBonded && !isDead && (
							<div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.25)]">
								<motion.div
									className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"
									animate={{ opacity: [1, 0.5, 1] }}
									transition={{ duration: 1.5, repeat: Infinity }}
								/>
								<span className="text-[10px] font-mono uppercase tracking-wider text-[#22c55e]">
									active
								</span>
							</div>
						)}
						{token.verified && (
							<div className="flex items-center gap-1 px-2 py-1 rounded-sm bg-[rgba(0,255,135,0.08)] border border-[rgba(0,255,135,0.2)]">
								<span className="text-[#00ff87] text-xs">✓</span>
							</div>
						)}
					</div>

					{/* Name overlay at bottom of image */}
					<div className="absolute bottom-0 inset-x-0 p-4 pb-3">
						<h3
							className={`font-bold text-[#e4e4e7] leading-tight ${
								isLarge ? "text-2xl sm:text-3xl" : isCompact ? "text-lg" : "text-xl sm:text-2xl"
							}`}
						>
							{token.name}
						</h3>
						<span
							className={`font-mono text-[#00ff87] ${
								isLarge ? "text-base" : "text-sm"
							}`}
						>
							${token.ticker}
						</span>
					</div>
				</div>

				{/* Content area - compact but data-rich */}
				<div className="flex flex-col gap-2.5 p-4 flex-1">
					{/* Description - only for non-compact */}
					{!isCompact && token.description && (
						<p className="text-xs text-[#71717a] leading-relaxed line-clamp-2">
							{truncateDescription(token.description, descMaxLen)}
						</p>
					)}

					{/* Stats row */}
					<div className="flex items-center gap-4 mt-auto">
						{token.marketcap > 0 && (
							<div className="flex flex-col">
								<span className="text-[9px] font-mono uppercase tracking-wider text-[#52525b]">
									mcap
								</span>
								<span className={`font-semibold text-[#e4e4e7] ${isCompact ? "text-sm" : "text-base"}`}>
									{formatMarketCap(token.marketcap)}
								</span>
							</div>
						)}
						{token.holders > 0 && (
							<div className="flex flex-col">
								<span className="text-[9px] font-mono uppercase tracking-wider text-[#52525b]">
									holders
								</span>
								<span className={`font-semibold text-[#e4e4e7] ${isCompact ? "text-sm" : "text-base"}`}>
									{token.holders.toLocaleString()}
								</span>
							</div>
						)}
						{/* Price - right aligned */}
						{token.price && (
							<div className="ml-auto text-right">
								<span className="text-[9px] font-mono text-[#52525b] block">price</span>
								<span className="text-xs font-mono text-[#71717a]">
									${Number(token.price).toFixed(6)}
								</span>
							</div>
						)}
					</div>

					{/* Bonding curve progress bar - prominent, full width */}
					{!isBonded && (
						<div className="w-full mt-2 pt-2 border-t border-[rgba(255,255,255,0.04)]">
							<div className="flex items-center justify-between mb-1.5">
								<span className="text-[9px] font-mono uppercase tracking-wider text-[#52525b]">
									bonding curve
								</span>
								<span className="text-[10px] font-mono font-semibold text-[#00ff87]">
									{curveProgress}%
								</span>
							</div>
							<div className="w-full h-1.5 rounded-sm bg-[rgba(255,255,255,0.06)] overflow-hidden">
								<motion.div
									className="h-full rounded-sm bg-gradient-to-r from-[#065f46] via-[#22c55e] to-[#00ff87]"
									initial={{ width: 0 }}
									animate={{ width: `${curveProgress}%` }}
									transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
								/>
							</div>
						</div>
					)}
				</div>

				{/* Hover glow overlay */}
				<motion.div
					className="absolute inset-0 pointer-events-none rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300"
					style={{
						background: "radial-gradient(circle at 50% 50%, rgba(0,255,135,0.05) 0%, transparent 70%)",
					}}
				/>
			</motion.div>
		</Link>
	);
};
