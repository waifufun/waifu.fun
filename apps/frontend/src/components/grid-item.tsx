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
	variant = "large",
}: {
	token: IToken;
	variant?: "large" | "medium" | "compact";
}) => {
	const isLarge = variant === "large";
	const imageHeight = isLarge ? "h-[360px] sm:h-[420px]" : "h-[280px]";
	const description = truncateDescription(token.description, isLarge ? 96 : 72);

	return (
		<Link href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}`} className="block h-full group">
			<motion.div
				className="relative flex h-full flex-col overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(12,12,15,0.78)]"
				initial={{ opacity: 1, y: 0 }}
				whileHover={{
					boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
					borderColor: "rgba(255,255,255,0.1)",
				}}
				style={{ willChange: "transform" }}
			>
				<div className={`relative w-full overflow-hidden ${imageHeight}`}>
					<motion.div className="absolute inset-0" whileHover={{ scale: 1.025 }} transition={{ duration: 0.7, ease: "easeOut" }}>
						<Image src={token.image} fill unoptimized alt={token.name} className="object-cover object-top" />
					</motion.div>
					<div className="absolute inset-0 bg-gradient-to-t from-[rgba(12,12,15,1)] via-[rgba(12,12,15,0.22)] to-transparent" />
					<div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(8,8,10,0.72)] px-3 py-1">
						<div className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
						<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#a1a1aa]">live</span>
					</div>
					<div className="absolute bottom-0 inset-x-0 p-5 pb-4">
						<h3 className="text-3xl font-semibold leading-none tracking-tight text-[#f4f4f5]">{token.name}</h3>
						<span className="mt-2 inline-block font-mono text-sm text-[#00ff87]">${token.ticker}</span>
					</div>
				</div>

				<div className="flex flex-1 flex-col gap-4 p-5">
					{description ? <p className="max-w-[44ch] text-sm leading-6 text-[#8f8f97]">{description}</p> : null}

					<div className="mt-auto grid grid-cols-2 gap-4 border-t border-[rgba(255,255,255,0.05)] pt-4">
						<div>
							<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">market cap</div>
							<div className="mt-1 text-3xl font-semibold tracking-tight text-[#f4f4f5]">
								{formatMarketCap(token.marketcap ?? 0)}
							</div>
						</div>
						<div>
							<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]">holders</div>
							<div className="mt-1 text-3xl font-semibold tracking-tight text-[#f4f4f5]">
								{(token.holders ?? 0).toLocaleString()}
							</div>
						</div>
					</div>
				</div>

				<div
					className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
					style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
				/>
			</motion.div>
		</Link>
	);
};
