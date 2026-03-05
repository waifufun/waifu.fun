"use client";
import { abbreviateNumber } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import Image from "next/image";
import Link from "next/link";

const CardContent = ({ token }: { token: IToken }) => (
	<>
		<div className="relative aspect-square w-full shrink-0">
			<Image
				src={token.image}
				width={500}
				height={500}
				unoptimized
				alt="image"
				className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-200"
			/>
			{/* Marketcap overlay: glass bar at bottom of image, touches bottom */}
			<div className="absolute bottom-0 left-0 right-0 flex justify-center items-center bg-white/25 backdrop-blur-md border-t border-white/30 py-2 px-3">
				<span className="text-[21px] font-bold tracking-tight text-white">
					{abbreviateNumber(token.marketcap)}
				</span>
			</div>
		</div>
		<div className="flex flex-col gap-2 flex-1 min-h-0 p-4">
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

	// Opaque background so the outer ring gradient never bleeds through (no green/blue tint on card)
	const cardClass = "flex flex-col h-full min-h-0 rounded-xl overflow-hidden flex-1 bg-white backdrop-blur-sm border border-white/50 hover:border-white/60 transition-colors";

	return (
		<Link
			href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`}
			className="block h-full min-h-0 group"
		>
			{isBonded ? (
				<div className={cardClass}>
					<CardContent token={token} />
				</div>
			) : (
				<div
					className="rounded-[16px] p-[4px] h-full min-h-0 flex flex-col"
					style={ringStyle}
				>
					<div className={cardClass}>
						<CardContent token={token} />
					</div>
				</div>
			)}
		</Link>
	);
};
