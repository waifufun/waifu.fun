"use client";

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTrades } from "@/lib/api";
import { cn, fromNow, getCoinGeckoChainName, shortenAddress } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@waifufun/constants";
import type { IToken } from "@waifufun/types";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { formatUnits } from "viem";
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
	source?: string | null;
	stale?: boolean | null;
	tokenAmount?: string | number | null;
	quoteAmount?: string | number | null;
	quoteTokenSymbol?: string | null;
	usdValue?: string | number | null;
	note?: string | null;
}

const headerClass = "text-[10px] font-mono uppercase tracking-wider text-[#71717a]";
const migratedStatuses = new Set(["completed", "dex", "migrated", "locked", "finalized"]);
const staleFeedMs = 1000 * 60 * 60 * 12;
const QUOTE_TOKEN_DECIMALS: Record<string, number> = {
	BNB: 18,
	WBNB: 18,
	ETH: 18,
	WETH: 18,
	SOL: 9,
	WSOL: 9,
	USDC: 6,
	USDT: 6,
};

const formatAmount = (value: string | number, maximumFractionDigits?: number) => {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) return "-";

	const absoluteValue = Math.abs(parsed);
	const resolvedFractionDigits =
		maximumFractionDigits ?? (absoluteValue >= 1000 ? 2 : absoluteValue >= 1 ? 4 : absoluteValue >= 0.01 ? 6 : 8);

	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: resolvedFractionDigits,
	}).format(parsed);
};

const parseTradeDate = (value?: string | null) => {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeText = (value?: string | number | null) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const getTradeSourceLabel = (source?: string | null) => {
	const normalizedSource = normalizeText(source).toLowerCase();
	if (!normalizedSource) return null;
	if (normalizedSource === "portal") return "portal";
	if (normalizedSource === "dex") return "external market";
	return normalizedSource.replace(/[-_]+/g, " ");
};

const isBackfillTrade = (trade: ApiTrade) => {
	const normalizedNote = normalizeText(trade.note).toLowerCase();
	const normalizedSource = normalizeText(trade.source).toLowerCase();

	return (
		normalizedSource === "backfill" ||
		normalizedNote.includes("backfill") ||
		normalizedNote.includes("historical") ||
		normalizedNote.includes("stale") ||
		normalizedNote.includes("migrated")
	);
};

const getTradeNotice = (trade: ApiTrade) => {
	if (trade.stale || isBackfillTrade(trade)) {
		return "historical / backfill";
	}

	const sourceLabel = getTradeSourceLabel(trade.source);
	if (sourceLabel && sourceLabel !== "portal") {
		return sourceLabel;
	}

	return null;
};

const hasVerifiedQuoteAmount = (trade: ApiTrade) => {
	return Boolean(normalizeText(trade.quoteAmount)) && !trade.stale && !isBackfillTrade(trade);
};

const toDisplayAmount = (value: string | number | null | undefined, decimals: number) => {
	const normalizedValue = normalizeText(value);
	if (!normalizedValue) return "";
	if (normalizedValue.includes(".") || normalizedValue.toLowerCase().includes("e")) return normalizedValue;
	if (!/^-?\d+$/.test(normalizedValue)) return normalizedValue;

	try {
		return formatUnits(BigInt(normalizedValue), decimals);
	} catch {
		return normalizedValue;
	}
};

const getQuoteTokenDecimals = (trade: ApiTrade, token: IToken) => {
	const normalizedSymbol = normalizeText(trade.quoteTokenSymbol).toUpperCase();
	if (normalizedSymbol && normalizedSymbol in QUOTE_TOKEN_DECIMALS) {
		return QUOTE_TOKEN_DECIMALS[normalizedSymbol];
	}

	if (token.chain === "solana") return 9;
	return 18;
};

const getTokenAmount = (trade: ApiTrade, token: IToken) => {
	const fallbackAmount = trade.side === "buy" ? trade.amountOut : trade.amountIn;
	return toDisplayAmount(normalizeText(trade.tokenAmount) || fallbackAmount, token.decimals);
};

const getQuoteAmount = (trade: ApiTrade, token: IToken) => {
	return toDisplayAmount(trade.quoteAmount, getQuoteTokenDecimals(trade, token));
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
	const hasHistoricalOrExternalRows = data.some((trade) => Boolean(getTradeNotice(trade)));
	const isStaleExternalFeed = Boolean(
		hasExternalMarket && latestTradeDate && Date.now() - latestTradeDate.getTime() > staleFeedMs,
	);
	const footerLabel = isStaleExternalFeed
		? `Historical portal feed · latest trade ${fromNow(latestTradeDate as Date)} · showing last ${data.length} trades`
		: hasHistoricalOrExternalRows
			? `Mixed portal / external history · showing last ${data.length} trades`
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

			{hasHistoricalOrExternalRows ? (
				<FeedNotice
					title="Historical / external rows"
					description="Some migrated or external-market rows are backfilled. Token amounts are shown when known, and counter-asset amounts only appear when the payload includes a verified quote amount."
					link={externalMarketUrl}
					linkLabel="view live market"
				/>
			) : null}

			<Table id="trades">
				<TableHeader>
					<TableRow>
						<TableHead className={cn(headerClass, "w-[100px]")}>account</TableHead>
						<TableHead className={cn(headerClass, "text-center")}>type</TableHead>
						<TableHead className={headerClass}>token amount</TableHead>
						<TableHead className={headerClass}>counter amount</TableHead>
						<TableHead className={cn(headerClass, "w-12 text-right")}>date</TableHead>
						<TableHead className="w-5 text-right" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((trade: ApiTrade) => {
						const isBuy = trade.side === "buy";
						const tokenAmount = getTokenAmount(trade, token);
						const quoteAmount = getQuoteAmount(trade, token);
						const quoteTokenSymbol = normalizeText(trade.quoteTokenSymbol);
						const usdValue = normalizeText(trade.usdValue);
						const tradeNotice = getTradeNotice(trade);
						const showQuoteAmount = hasVerifiedQuoteAmount(trade);

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
								<TableCell>
									<div className="flex flex-col">
										{showQuoteAmount ? (
											<>
												<span className="font-mono text-sm text-[#e4e4e7]">
													{formatAmount(quoteAmount)}
													{quoteTokenSymbol ? ` ${quoteTokenSymbol}` : ""}
												</span>
												{usdValue ? (
													<span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717a]">
														≈ ${formatAmount(usdValue)}
													</span>
												) : null}
											</>
										) : (
											<>
												<span className="font-mono text-sm text-[#71717a]">—</span>
												{tradeNotice ? (
													<span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717a]">
														{tradeNotice}
													</span>
												) : null}
											</>
										)}
									</div>
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
						<TableCell colSpan={6}>
							<div className="mx-auto w-full text-center text-xs uppercase text-[#71717a]">{footerLabel}</div>
						</TableCell>
					</TableRow>
				</TableFooter>
			</Table>
		</div>
	);
}
