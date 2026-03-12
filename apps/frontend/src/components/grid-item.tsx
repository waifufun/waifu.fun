"use client";

import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

function formatMarketCap(mc: number): string {
	if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}m`;
	if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}k`;
	return `$${mc}`;
}

function truncateDescription(desc: string | undefined, maxLen: number): string {
	if (!desc) return "";
	if (desc.length <= maxLen) return desc;
	return `${desc.slice(0, maxLen).trimEnd()}…`;
}

export const GridItem = ({
	token,
	variant = "standard",
}: {
	token: IToken;
	variant?: "featured" | "standard";
}) => {
	const isFeatured = variant === "featured";
	const description = truncateDescription(token.description, isFeatured ? 120 : 80);

	if (isFeatured) {
		return (
			<Link href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`} className="block w-full group">
				<motion.div
					className="relative w-full overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]"
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: "easeOut" }}
					whileHover={{
						boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
						borderColor: "rgba(255,255,255,0.1)",
					}}
				>
					{/* Featured: landscape 2:1 aspect ratio */}
					<div className="relative w-full aspect-[2/1] overflow-hidden">
						<motion.div
							className="absolute inset-0"
							whileHover={{ scale: 1.015 }}
							transition={{ type: "spring", stiffness: 200, damping: 24 }}
						>
							<Image
								src={token.image}
								fill
								unoptimized
								alt={token.name}
								className="object-cover"
							/>
						</motion.div>
						
						{/* Gradient overlay for text legibility */}
						<div className="absolute inset-0 bg-gradient-to-t from-[rgba(8,8,10,0.95)] via-[rgba(8,8,10,0.3)] to-transparent" />
						
						{/* Content overlay at bottom */}
						<div className="absolute bottom-0 inset-x-0 p-6 sm:p-8">
							<div className="flex flex-col gap-3">
								<div>
									<h3 className="text-3xl sm:text-4xl font-semibold leading-none tracking-tight text-[#f4f4f5]">
										{token.name}
									</h3>
									<span className="mt-2 inline-block font-mono text-sm text-[#00ff87]">
										${token.ticker}
									</span>
								</div>
								
								{description && (
									<p className="max-w-[60ch] text-sm leading-relaxed text-[#8f8f97] line-clamp-2">
										{description}
									</p>
								)}
								
								{/* Inline stats */}
								<div className="flex items-center gap-6 pt-2">
									<div className="flex items-baseline gap-2">
										<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">
											mcap
										</span>
										<span className="text-lg font-semibold text-[#e4e4e7]">
											{formatMarketCap(token.marketcap ?? 0)}
										</span>
									</div>
									<div className="flex items-baseline gap-2">
										<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">
											holders
										</span>
										<span className="text-lg font-semibold text-[#e4e4e7]">
											{(token.holders ?? 0).toLocaleString()}
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</motion.div>
			</Link>
		);
	}

	// Standard variant: portrait 4:5
	return (
		<Link href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`} className="block h-full group">
			<motion.div
				className="relative flex h-full flex-col overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]"
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, ease: "easeOut" }}
				whileHover={{
					boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
					borderColor: "rgba(255,255,255,0.1)",
				}}
			>
				{/* Standard: portrait 4:5 aspect ratio */}
				<div className="relative w-full aspect-[4/5] overflow-hidden">
					<motion.div
						className="absolute inset-0"
						whileHover={{ scale: 1.015 }}
						transition={{ type: "spring", stiffness: 200, damping: 24 }}
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
					<div className="absolute inset-0 bg-gradient-to-t from-[rgba(8,8,10,0.9)] via-transparent to-transparent" />
					
					{/* Name/ticker overlay at bottom of image */}
					<div className="absolute bottom-0 inset-x-0 p-4">
						<h3 className="text-2xl font-semibold leading-none tracking-tight text-[#f4f4f5]">
							{token.name}
						</h3>
						<span className="mt-1.5 inline-block font-mono text-sm text-[#00ff87]">
							${token.ticker}
						</span>
					</div>
				</div>
				
				{/* Description and stats below image */}
				<div className="flex flex-col gap-3 p-4 pt-3">
					{description && (
						<p className="text-sm leading-relaxed text-[#8f8f97] line-clamp-2">
							{description}
						</p>
					)}
					
					{/* Inline stats */}
					<div className="flex items-center gap-5 pt-1">
						<div className="flex items-baseline gap-1.5">
							<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">
								mcap
							</span>
							<span className="text-lg font-semibold text-[#e4e4e7]">
								{formatMarketCap(token.marketcap ?? 0)}
							</span>
						</div>
						<div className="flex items-baseline gap-1.5">
							<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">
								holders
							</span>
							<span className="text-lg font-semibold text-[#e4e4e7]">
								{(token.holders ?? 0).toLocaleString()}
							</span>
						</div>
					</div>
				</div>
			</motion.div>
		</Link>
	);
};
