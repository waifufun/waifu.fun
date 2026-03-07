"use client";

import { cn } from "@/lib/utils";
import { Clock, TrendingUp, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface RecentToken {
	name: string;
	ticker: string;
	image?: string;
	createdAt: string;
	marketCap?: string;
	href?: string;
}

const mockRecentTokens: RecentToken[] = [
	{ name: "Pepe Classic", ticker: "PEPEC", createdAt: "2 min ago", marketCap: "$12.5K" },
	{ name: "Moon Dog", ticker: "MDOG", createdAt: "5 min ago", marketCap: "$8.2K" },
	{ name: "Based Cat", ticker: "BCAT", createdAt: "12 min ago", marketCap: "$45.1K" },
];

export function RecentlyCreated({
	className,
	tokens = mockRecentTokens,
}: { className?: string; tokens?: RecentToken[] }) {
	return (
		<div className={cn("bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-4", className)}>
			<div className="flex items-center gap-2 mb-4">
				<div className="w-2 h-2 bg-[#00ff87] rounded-full animate-pulse" />
				<h3 className="text-sm font-bold text-[#00ff87] uppercase tracking-wider">recently launched</h3>
			</div>

			<div className="space-y-3">
				{tokens.map((token, index) => {
					const Content = (
						<>
							<div className="relative w-10 h-10 rounded-sm overflow-hidden bg-[#111114] flex-shrink-0">
								{token.image ? (
									<Image src={token.image} alt={token.name} fill className="object-cover" />
								) : (
									<div className="w-full h-full flex items-center justify-center text-[#52525b] text-xs font-bold">
										{token.ticker.slice(0, 2)}
									</div>
								)}
							</div>

							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-1.5">
									<span className="text-sm font-semibold text-[#e4e4e7] truncate">{token.name}</span>
									<span className="text-xs text-[#00ff87] font-mono">${token.ticker}</span>
								</div>

								<div className="flex items-center gap-3 mt-0.5">
									<span className="flex items-center gap-1 text-[10px] text-[#71717a]">
										<Clock size={10} />
										{token.createdAt}
									</span>
									{token.marketCap && (
										<span className="flex items-center gap-1 text-[10px] text-[#00ff87]">
											<TrendingUp size={10} />
											{token.marketCap}
										</span>
									)}
								</div>
							</div>

							{token.href && (
								<ExternalLink size={14} className="text-[#52525b] group-hover:text-[#00ff87] flex-shrink-0" />
							)}
						</>
					);

					const className =
						"flex items-center gap-3 p-2 rounded-sm bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.04)] transition-all";

					if (token.href) {
						return (
							<Link
								key={`${token.ticker}-${index}`}
								href={token.href}
								className={`${className} hover:border-[rgba(0,255,135,0.2)] hover:bg-[rgba(0,255,135,0.03)] group`}
							>
								{Content}
							</Link>
						);
					}

					return (
						<div key={`${token.ticker}-${index}`} className={className}>
							{Content}
						</div>
					);
				})}
			</div>

			<Link
				href="/"
				className="block mt-4 text-center text-xs text-[#71717a] hover:text-[#00ff87] uppercase tracking-wider"
			>
				view all tokens →
			</Link>
		</div>
	);
}
