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
}: {
	token: IToken;
	variant?: "hero" | "medium";
}) => {
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const isBonded = token?.curveCompleted || curveProgress >= 100;
	const isDead = token?.status === "finalized" || (isBonded && token?.marketcap === 0);
	const isHero = variant === "hero";

	const descMaxLen = isHero ? 120 : 72;

	return (
		<Link
			href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
			className="block h-full group"
		>
			<motion.div
				className={`
					relative flex flex-col h-full rounded-2xl overflow-hidden
					bg-[rgba(17,17,20,0.7)] backdrop-blur-md
					border border-[rgba(255,255,255,0.06)]
					transition-colors duration-300
				`}
				whileHover={{
					y: -4,
					boxShadow: "0 0 40px rgba(139,92,246,0.15), 0 8px 32px rgba(0,0,0,0.4)",
					borderColor: "rgba(139,92,246,0.2)",
				}}
				transition={{ type: "spring", stiffness: 260, damping: 24 }}
			>
				{/* Image area */}
				<div
					className={`relative w-full overflow-hidden ${
						isHero ? "h-[320px] sm:h-[380px]" : "h-[220px] sm:h-[260px]"
					}`}
				>
					<motion.div
						className="absolute inset-0"
						whileHover={{ scale: 1.05 }}
						transition={{ duration: 0.6, ease: "easeOut" }}
					>
						<Image
							src={token.image}
							width={800}
							height={800}
							unoptimized
							alt={token.name}
							className="w-full h-full object-cover"
						/>
					</motion.div>

					{/* Gradient overlay */}
					<div className="absolute inset-0 bg-gradient-to-t from-[rgba(17,17,20,0.95)] via-[rgba(17,17,20,0.3)] to-transparent" />

					{/* Status badge */}
					{isDead && (
						<div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] backdrop-blur-sm">
							<span className="text-[10px] font-mono uppercase tracking-wider text-red-400">
								inactive
							</span>
						</div>
					)}
					{isBonded && !isDead && (
						<div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.3)] backdrop-blur-sm">
							<span className="text-[10px] font-mono uppercase tracking-wider text-[#c084fc]">
								bonded
							</span>
						</div>
					)}

					{/* Verified badge */}
					{token.verified && (
						<div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[rgba(103,232,249,0.1)] border border-[rgba(103,232,249,0.2)] backdrop-blur-sm">
							<span className="text-[10px] font-mono uppercase tracking-wider text-[#67e8f9]">
								✓ verified
							</span>
						</div>
					)}

					{/* Name overlay at bottom of image */}
					<div className="absolute bottom-0 inset-x-0 p-4 pb-3">
						<h3
							className={`font-bold text-[#e4e4e7] leading-tight ${
								isHero ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
							}`}
						>
							{token.name}
						</h3>
						<span
							className={`font-mono text-[#8b5cf6] ${
								isHero ? "text-base" : "text-sm"
							}`}
						>
							${token.ticker}
						</span>
					</div>
				</div>

				{/* Content area */}
				<div className="flex flex-col gap-3 p-4 flex-1">
					{/* Description */}
					{token.description && (
						<p
							className={`text-[#71717a] leading-relaxed ${
								isHero ? "text-sm" : "text-xs"
							}`}
						>
							{truncateDescription(token.description, descMaxLen)}
						</p>
					)}

					{/* Stats row */}
					<div className="flex items-center gap-4 mt-auto pt-2">
						{token.marketcap > 0 && (
							<div className="flex flex-col">
								<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">
									mcap
								</span>
								<span className="text-sm font-semibold text-[#e4e4e7]">
									{formatMarketCap(token.marketcap)}
								</span>
							</div>
						)}
						{token.holders > 0 && (
							<div className="flex flex-col">
								<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">
									holders
								</span>
								<span className="text-sm font-semibold text-[#e4e4e7]">
									{token.holders.toLocaleString()}
								</span>
							</div>
						)}
						{token.volume24h > 0 && isHero && (
							<div className="flex flex-col">
								<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">
									24h vol
								</span>
								<span className="text-sm font-semibold text-[#e4e4e7]">
									{formatMarketCap(token.volume24h)}
								</span>
							</div>
						)}
					</div>

					{/* Bonding curve progress bar (only if not fully bonded) */}
					{!isBonded && (
						<div className="w-full mt-1">
							<div className="flex items-center justify-between mb-1">
								<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">
									bonding curve
								</span>
								<span className="text-[10px] font-mono text-[#71717a]">
									{curveProgress}%
								</span>
							</div>
							<div className="w-full h-[3px] rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
								<motion.div
									className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#c084fc]"
									initial={{ width: 0 }}
									animate={{ width: `${curveProgress}%` }}
									transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
								/>
							</div>
						</div>
					)}
				</div>
			</motion.div>
		</Link>
	);
};
