"use client";

import { deriveAgentLifecycleStatus } from "@/components/token-page/agent-profile";
import { hasAggregateHolderCount } from "@/components/token-page/holder-data-state";
import { abbreviateNumber, formatNumberSubscript } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import { ArrowUpRight, BarChart3, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

function MetricChip({
	label,
	value,
	icon: Icon,
	live = false,
}: {
	label: string;
	value: string;
	icon: typeof TrendingUp;
	live?: boolean;
}) {
	return (
		<div className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm bg-white/[0.02] border border-white/[0.04]">
			<Icon className="size-3 text-[#52525b]" />
			<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b]">{label}</span>
			<span className="text-[11px] font-mono text-[#e4e4e7]">{value}</span>
			{live && <span className="h-1 w-1 rounded-full bg-[#00ff87] animate-pulse" />}
		</div>
	);
}

export default function MarketRibbon({
	token,
	marketDataSource,
}: {
	token: IToken;
	marketDataSource?: "dexscreener" | null;
}) {
	const status = deriveAgentLifecycleStatus(token);
	const hasAggregateHolders = hasAggregateHolderCount(token);
	const hasLiveExternalMarketData = marketDataSource === "dexscreener";
	const isLive = hasLiveExternalMarketData || !status.isExternalMarket;

	const marketFeed = status.isExternalMarket
		? marketDataSource === "dexscreener"
			? "external"
			: "indexed"
		: "bonding";

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.12, duration: 0.3 }}
			className="flex items-center justify-between gap-3 py-3 border-y border-white/[0.04]"
		>
			<div className="flex flex-wrap items-center gap-2">
				<MetricChip label="price" value={formatNumberSubscript(token.price)} icon={TrendingUp} live={isLive} />
				<MetricChip
					label="mcap"
					value={token.marketcap ? `$${abbreviateNumber(token.marketcap)}` : "—"}
					icon={BarChart3}
					live={isLive}
				/>
				{token.volume24h ? (
					<MetricChip label="vol" value={`$${abbreviateNumber(token.volume24h)}`} icon={BarChart3} />
				) : null}
				{hasAggregateHolders && (
					<MetricChip label="holders" value={abbreviateNumber(token.holders, true)} icon={Users} />
				)}
			</div>

			<Link
				href={`/token/${token.chain}/${token.chainId}/${token.contractAddress}?view=market`}
				className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#52525b] hover:text-[#a1a1aa] transition-colors shrink-0"
			>
				<span>{marketFeed} market</span>
				<ArrowUpRight className="size-3" />
			</Link>
		</motion.div>
	);
}
