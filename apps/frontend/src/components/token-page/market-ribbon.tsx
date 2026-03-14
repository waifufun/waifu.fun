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
		<div className="flex items-center gap-1 px-1.5 py-1">
			<Icon className="size-2.5 text-zinc-700" />
			<span className="text-[9px] font-mono uppercase tracking-wider text-zinc-700">{label}</span>
			<span className="text-[9px] font-mono text-zinc-500">{value}</span>
			{live && <span className="h-1 w-1 rounded-full bg-[#00ff87]/60" />}
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
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ delay: 0.15, duration: 0.4 }}
			className="flex items-center justify-between gap-3 py-2 border-t border-white/[0.03]"
		>
			<div className="flex flex-wrap items-center gap-1">
				<MetricChip label="price" value={formatNumberSubscript(token.price)} icon={TrendingUp} live={isLive} />
				<MetricChip
					label="mcap"
					value={token.marketcap ? `$${abbreviateNumber(token.marketcap)}` : "\u2014"}
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
				className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-zinc-700 hover:text-zinc-500 transition-colors shrink-0"
			>
				<span>{marketFeed} market</span>
				<ArrowUpRight className="size-2.5" />
			</Link>
		</motion.div>
	);
}
