"use client";

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTrades } from "@/lib/api";
import { cn, fromNow, getCoinGeckoChainName, shortenAddress } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@waifufun/constants";
import type { IToken } from "@waifufun/types";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import TimeAgo from "../time-ago";
import Triangle from "../triangle";

interface ApiTrade {
	id: string;
	tokenAddress: string;
	side: "buy" | "sell";
	traderAddress: string;
	amountIn: string;
	amountOut: string;
	txHash: string;
	blockNumber: number;
	timestamp: string;
}

const headerClass = "text-[10px] font-mono uppercase tracking-wider text-[#71717a]";
const migratedStatuses = new Set(["completed", "dex", "migrated", "locked", "finalized"]);
const staleFeedMs = 1000 * 60 * 60 * 12;

const formatAmount = (value: string | number, maximumFractionDigits = 2) => {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) return "-";

	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits,
	}).format(parsed);
};

const parseTradeDate = (value?: string | null) => {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getExternalMarketUrl = (token: IToken) => {
	const tokenWithPool = token as IToken & { pool?: string };
	const isMigrated = migratedStatuses.has(token.status);
	const curveCompleted = (token?.curveCompleted && isMigrated) || token?.imported;
	const geckoChainName =
		token.chain === "evm" && Number(token.chainId) === 56
			? "bsc"
			: getCoinGeckoChainName(token.chain, token.chainId as never);

	if (!curveCompleted || !geckoChainName || !tokenWithPool.pool) {
		return null;
	}

	return `https://www.geckoterminal.com/${geckoChainName}/pools/${tokenWithPool.pool}`;
};

function FeedNotice({
	title,
	description,
	link,
	linkLabel,
}: {
	title: string;
	description: string;
	link?: string | null;
	linkLabel?: string;
}) {
	return (
		<div className="rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] px-4 py-3">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#00ff87]">{title}</div>
					<p className="text-sm leading-relaxed text-[#a1a1aa]">{description}</p>
				</div>
				{link ? (
					<Link
						href={link}
						target="_blank"
						className="inline-flex items-center gap-1 self-start rounded-sm border border-[#00ff87]/20 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#00ff87] transition-colors hover:border-[#00ff87]/35 hover:bg-[#00ff87]/5"
					>
						{linkLabel ?? "view market"}
						<ExternalLink className="size-3" />
					</Link>
				) : null}
			</div>
		</div>
	);
}

// biome-ignore lint/suspicious/noExplicitAny: server component passes unknown initial response shape
export default function TradesClient({ token, initialData }: { token: IToken; initialData: any }) {
	const nonAnimatedTrades = Array.from(new Set<string>((initialData ?? []).map((trade: ApiTrade) => trade.txHash)));
	const query = useQuery({
		queryKey: ["trades", token.chain, token.chainId, token.contractAddress],
		queryFn: async () => {
			return await getTrades({
				chain: token.chain,
				chainId: token.chainId,
				contractAddress: token.contractAddress,
			});
		},
		initialData,
		refetchInterval: 3_500,
	});

	const rawData = query.data as ApiTrade[] | undefined;
	const data = [...(rawData ?? [])].sort((left, right) => {
		const leftTimestamp = parseTradeDate(left.timestamp)?.getTime() ?? 0;
		const rightTimestamp = parseTradeDate(right.timestamp)?.getTime() ?? 0;
		return rightTimestamp - leftTimestamp;
	});

	const tokenWithPool = token as IToken & { pool?: string };
	const isMigratedToken = migratedStatuses.has(token.status);
	const externalMarketUrl = getExternalMarketUrl(token);
	const hasExternalMarket = Boolean(token.imported || tokenWithPool.pool || (token.curveCompleted && isMigratedToken));
	const latestTradeDate = parseTradeDate(data[0]?.timestamp);
	const isStaleExternalFeed = Boolean(
		hasExternalMarket && latestTradeDate && Date.now() - latestTradeDate.getTime() > staleFeedMs,
	);
	const footerLabel = isStaleExternalFeed
		? `Historical portal feed · latest trade ${fromNow(latestTradeDate as Date)} · showing last ${data.length} trades`
		: `Portal feed · showing last ${data.length} trades`;

	if (!data.length) {
		if (hasExternalMarket) {
			return (
				<div className="space-y-3">
					<FeedNotice
						title="External market activity"
						description={`${token.ticker} now trades on an external market. This page does not currently have verified portal trades to show here.`}
						link={externalMarketUrl}
						linkLabel="open market"
					/>
					<div className="w-full p-4 py-8 text-center text-sm text-[#a1a1aa]">
						No verified portal trades are available for this token right now.
					</div>
				</div>
			);
		}

		return <div className="w-full p-4 py-8 text-center text-sm text-[#a1a1aa]">There are currently no trades.</div>;
	}

	return (
		<div className="space-y-3">
			{isStaleExternalFeed ? (
				<FeedNotice
					title="Historical portal trades"
					description={`${token.ticker} has moved to an external market. The table below only shows the last portal trades we can verify here, so newer external swaps may not appear on this tab.`}
					link={externalMarketUrl}
					linkLabel="view live market"
				/>
			) : null}

			<FeedNotice
				title="Token-side amounts only"
				description="Counter-asset amounts are hidden on this tab for now because the current trades payload does not reliably identify them yet."
			/>

			<Table id="trades">
				<TableHeader>
					<TableRow>
						<TableHead className={cn(headerClass, "w-[100px]")}>account</TableHead>
						<TableHead className={cn(headerClass, "text-center")}>type</TableHead>
						<TableHead className={headerClass}>token amount</TableHead>
						<TableHead className={cn(headerClass, "w-12 text-right")}>date</TableHead>
						<TableHead className="w-5 text-right" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((trade: ApiTrade) => {
						const isBuy = trade.side === "buy";
						const tokenAmount = isBuy ? trade.amountOut : trade.amountIn;

						return (
							<TableRow
								key={trade.id || `${trade.txHash}-${trade.blockNumber}`}
								className={cn(
									isBuy ? "bg-[#00ff87]/[0.02]" : "bg-[#ef4444]/[0.02]",
									!nonAnimatedTrades.includes(trade.txHash)
										? "animate-shake animate-once animate-duration-200 animate-ease-linear"
										: "",
								)}
							>
								<TableCell className="font-medium hover:text-[#00ff87]">
									<Link href={`/profile/${trade.traderAddress}`}>
										{trade.traderAddress ? shortenAddress(trade.traderAddress) : "-"}
									</Link>
								</TableCell>
								<TableCell>
									<div className="flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
										<Triangle direction={isBuy ? "up" : "down"} />
										<span className={isBuy ? "text-[#00ff87]" : "text-red-400"}>{trade.side}</span>
									</div>
								</TableCell>
								<TableCell>
									<span className="font-mono text-sm text-[#e4e4e7]">
										{formatAmount(tokenAmount)} {token.ticker}
									</span>
								</TableCell>
								<TableCell className="text-right">
									{trade.timestamp ? <TimeAgo date={trade.timestamp} /> : "-"}
								</TableCell>
								<TableCell>
									<Link
										href={`${CHAIN_TO_BLOCK_EXPLORER_URL[token.chain]?.[token.chainId] ?? ""}/tx/${trade.txHash}`}
										target="_blank"
									>
										<ExternalLink className="ml-auto size-4 text-[#00ff87]" />
									</Link>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
				<TableFooter className="border-t-2 border-[#00ff87]/25">
					<TableRow>
						<TableCell colSpan={5}>
							<div className="mx-auto w-full text-center text-xs uppercase text-[#71717a]">{footerLabel}</div>
						</TableCell>
					</TableRow>
				</TableFooter>
			</Table>
		</div>
	);
}
