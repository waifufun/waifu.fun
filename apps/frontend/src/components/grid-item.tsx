"use client";
import type { IToken } from "@waifufun/types";
import Image from "next/image";
import Link from "next/link";

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
			{/* Title and ticker: top-right, flush to inner ring, glass background (no border), blue text */}
			<div className="absolute top-0 right-0 rounded-bl-lg rounded-tr-xl bg-white/40 px-3 py-2 backdrop-blur-sm">
				<span className="block text-2xl font-bold text-[#2563eb] line-clamp-1 text-right">
					{token?.name}
				</span>
				<span className="block text-xl font-bold text-[#2563eb]/90 text-right">
					${token?.ticker}
				</span>
			</div>
		</div>
		{/* Bottom section: name and ticker (kept as before) */}
		<div className="flex flex-col gap-1 flex-1 min-h-0 p-3">
			<div className="flex flex-col">
				<span className="text-sm font-medium text-gray-900 line-clamp-1 truncate">
					{token?.name}
				</span>
				<span className="text-sm font-medium text-gray-700 line-clamp-1">
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
		background: `conic-gradient(from 0deg, #4ade80 0deg, #4ade80 ${progressDeg}deg, rgba(255,255,255,0.22) ${progressDeg}deg, rgba(255,255,255,0.22) 360deg)`,
	};

	// Glass when bonded; opaque when ring is showing so green never bleeds onto card
	const cardBase = "flex flex-col h-full min-h-0 rounded-xl overflow-hidden flex-1 border border-white/60 hover:border-white/80 transition-colors";
	const cardClassBonded = `${cardBase} bg-white/40 backdrop-blur-sm hover:bg-white/50`;
	const cardClassWithRing = `${cardBase} bg-white`;

	return (
		<Link
			href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
			className="block h-full min-h-0 max-h-[240px] group"
		>
			{isBonded ? (
				<div className={cardClassBonded}>
					<CardContent token={token} />
				</div>
			) : (
				<div
					className="rounded-[16px] p-[4px] h-full min-h-0 flex flex-col"
					style={ringStyle}
				>
					<div className={cardClassWithRing}>
						<CardContent token={token} />
					</div>
				</div>
			)}
		</Link>
	);
};
