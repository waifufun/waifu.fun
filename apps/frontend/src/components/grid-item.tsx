"use client";
import type { IToken } from "@waifufun/types";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const CardContent = ({ token }: { token: IToken }) => (
	<>
		<div className="relative w-full h-[168px] shrink-0">
			<Image
				src={token.image}
				width={500}
				height={500}
				unoptimized
				alt="image"
				className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-200"
			/>
			{/* Dark gradient overlay at bottom of image */}
			<div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#111114] to-transparent" />
			{/* Title and ticker: dark glass background */}
			<div className="absolute top-0 right-0 rounded-bl-lg rounded-tr-xl bg-[rgba(8,8,10,0.8)] backdrop-blur-sm px-3 py-2 border-l border-b border-[rgba(255,255,255,0.06)]">
				<span className="block text-2xl font-bold text-[#e4e4e7] line-clamp-1 text-right">
					{token?.name}
				</span>
				<span className="block text-xl font-bold text-[#71717a] text-right">
					${token?.ticker}
				</span>
			</div>
		</div>
		{/* Bottom section */}
		<div className="flex flex-col gap-1 flex-1 min-h-0 p-3 bg-[#111114]">
			<div className="flex flex-col">
				<span className="text-sm font-medium text-[#e4e4e7] line-clamp-1 truncate">
					{token?.name}
				</span>
				<span className="text-sm font-medium text-[#71717a] line-clamp-1">
					${token?.ticker}
				</span>
			</div>
		</div>
	</>
);

export const GridItem = ({ token }: { token: IToken }) => {
	const isBonded = token?.curveCompleted || Number(token?.curveProgress ?? 0) >= 100;
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const progressDeg = (curveProgress / 100) * 360;
	const ringStyle = {
		background: `conic-gradient(from 0deg, #8b5cf6 0deg, #8b5cf6 ${progressDeg}deg, rgba(255,255,255,0.06) ${progressDeg}deg, rgba(255,255,255,0.06) 360deg)`,
	};

	const cardBase = "flex flex-col h-full min-h-0 rounded-xl overflow-hidden flex-1 bg-[#111114] border border-[rgba(255,255,255,0.06)] transition-all duration-200";

	return (
		<Link
			href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
			className="block h-full min-h-0 group"
		>
			{isBonded ? (
				<motion.div 
					className={cardBase}
					whileHover={{ 
						y: -2, 
						scale: 1.02,
						borderColor: "rgba(255,255,255,0.12)",
						boxShadow: "0 0 20px rgba(139, 92, 246, 0.15)"
					}}
					transition={{ type: "spring", stiffness: 200, damping: 20 }}
				>
					<CardContent token={token} />
				</motion.div>
			) : (
				<motion.div
					className="rounded-[16px] p-[4px] h-full min-h-0 flex flex-col"
					style={ringStyle}
					whileHover={{ 
						y: -2, 
						scale: 1.02 
					}}
					transition={{ type: "spring", stiffness: 200, damping: 20 }}
				>
					<div className={cardBase}>
						<CardContent token={token} />
					</div>
				</motion.div>
			)}
		</Link>
	);
};
