"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/contexts/locale-context";
import { getTrades } from "@/lib/api";
import { cn, fromNow, getCoinGeckoChainName, shortenAddress } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@waifufun/constants";
import type { IToken } from "@waifufun/types";
import { ChevronDown, ChevronUp, ExternalLink, History, Radio } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
	source?: TradeSource;
	stale?: boolean | null;
	tokenAmount?: string | number | null;
	quoteAmount?: string | number | null;
	quoteTokenSymbol?: string | null;
	usdValue?: string | number | null;
	note?: string | null;
}

interface TradeSourceMetadata {
	kind?: "indexed" | "third-party" | string | null;
	provider?: "waifu-indexer" | "geckoterminal" | string | null;
	network?: string | null;
	poolAddress?: string | null;
	fetchedAt?: string | null;
}

type TradeSource = string | TradeSourceMetadata | null;

const headerClass = "text-[10px] font-mono uppercase tracking-wider text-[#71717a]";
// DO NOT i18n: internal token status names matched against API responses (see audit 5d)
const migratedStatuses = new Set(["completed", "dex", "migrated", "locked", "finalized"]);
const staleFeedMs = 1000 * 60 * 60 * 12;
const DEFAULT_VISIBLE_ROWS = 6;
const QUOTE_TOKEN_DECIMALS = {
	BNB: 18,
	WBNB: 18,
	ETH: 18,
	WETH: 18,
	SOL: 9,
	WSOL: 9,
	USDC: 6,
	USDT: 6,
} as const;

type QuoteTokenSymbol = keyof typeof QUOTE_TOKEN_DECIMALS;
type TokenWithQuoteSymbol = IToken & { quoteTokenSymbol?: string | null };

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

const isNumericAmount = (value: string | number | null | undefined) => {
	const normalizedValue = normalizeText(value);
	if (!normalizedValue) return false;
	if (/^-?\d+$/.test(normalizedValue)) return true;

	const parsed = Number(normalizedValue);
	return Number.isFinite(parsed);
};

const isKnownQuoteTokenSymbol = (value: string): value is QuoteTokenSymbol => {
	return value in QUOTE_TOKEN_DECIMALS;
};

const getTradeSourceMetadata = (source?: TradeSource) => {
	if (!source || typeof source === "string") return null;
	return source;
};

const getTradeSourceText = (source?: TradeSource) => {
	if (typeof source === "string") return normalizeText(source).toLowerCase();
	return "";
};

const getTradeSourceKind = (source?: TradeSource) => {
	const metadata = getTradeSourceMetadata(source);
	const kind = normalizeText(metadata?.kind).toLowerCase();
	if (kind) return kind;

	const sourceText = getTradeSourceText(source);
	// DO NOT i18n: matched against internal source strings
	if (sourceText === "dex" || sourceText === "third-party" || sourceText === "geckoterminal") {
		return "third-party";
	}
	if (sourceText) return "indexed";

	return "";
};

const getTradeSourceProvider = (source?: TradeSource) => {
	const metadata = getTradeSourceMetadata(source);
	const provider = normalizeText(metadata?.provider).toLowerCase();
	if (provider) return provider;

	const sourceText = getTradeSourceText(source);
	if (sourceText === "dex") return "third-party-market";

	return sourceText;
};

// NOTE: returns a key suffix; caller translates via `t("token.trades.sourceLabel.<suffix>")` or echoes raw text.
const getTradeSourceLabelKey = (source?: TradeSource): { key?: string; raw?: string } => {
	const kind = getTradeSourceKind(source);
	const provider = getTradeSourceProvider(source);
	const sourceText = getTradeSourceText(source);

	if (provider === "geckoterminal") return { key: "geckoterminal" };
	if (kind === "third-party") return { key: "externalMarket" };
	if (sourceText === "portal") return { key: "portal" };
	if (sourceText) return { raw: sourceText.replace(/[-_]+/g, " ") };

	return {};
};

const isExternalTrade = (trade: ApiTrade) => {
	const kind = getTradeSourceKind(trade.source);
	const provider = getTradeSourceProvider(trade.source);
	const note = normalizeText(trade.note).toLowerCase();

	// DO NOT i18n: matched against API note field (see audit 5d)
	return kind === "third-party" || provider === "geckoterminal" || note.includes("geckoterminal");
};

const isBackfillTrade = (trade: ApiTrade) => {
	const normalizedNote = normalizeText(trade.note).toLowerCase();
	const normalizedSource = getTradeSourceText(trade.source);
	const sourceKind = getTradeSourceKind(trade.source);

	// DO NOT i18n: matched against API note + source fields (see audit 5d)
	return (
		sourceKind === "indexed" &&
		(normalizedSource === "backfill" ||
			normalizedNote.includes("backfill") ||
			normalizedNote.includes("historical") ||
			normalizedNote.includes("stale") ||
			normalizedNote.includes("migrated"))
	);
};

const hasHistoricalContext = (trade: ApiTrade) => {
	if (isExternalTrade(trade)) {
		return false;
	}

	if (trade.stale || isBackfillTrade(trade)) {
		return true;
	}

	const sourceLabelInfo = getTradeSourceLabelKey(trade.source);
	return Boolean((sourceLabelInfo.key && sourceLabelInfo.key !== "portal") || sourceLabelInfo.raw);
};

const hasVerifiedQuoteAmount = (trade: ApiTrade, token: IToken) => {
	return Boolean(getQuoteAmount(trade, token)) && !trade.stale && !isBackfillTrade(trade);
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

const getQuoteTokenDecimals = (trade: ApiTrade, token: IToken): number => {
	const normalizedSymbol = getQuoteTokenSymbol(trade, token).toUpperCase();
	if (normalizedSymbol && isKnownQuoteTokenSymbol(normalizedSymbol)) {
		return QUOTE_TOKEN_DECIMALS[normalizedSymbol];
	}

	if (token.chain === "solana") return 9;
	return 18;
};

const getRenderableAmount = (value: string | number | null | undefined, decimals: number) => {
	const displayAmount = toDisplayAmount(value, decimals);
	return isNumericAmount(displayAmount) ? displayAmount : null;
};

const getTokenAmount = (trade: ApiTrade, token: IToken) => {
	const fallbackAmount = trade.side === "buy" ? trade.amountOut : trade.amountIn;
	return getRenderableAmount(normalizeText(trade.tokenAmount) || fallbackAmount, token.decimals);
};

const canInferLiveExternalQuote = (trade: ApiTrade) => {
	return isExternalTrade(trade) && !trade.stale && !isBackfillTrade(trade);
};

const getInferredQuoteAmount = (trade: ApiTrade, token: IToken) => {
	if (!canInferLiveExternalQuote(trade)) return null;

	const fallbackAmount = trade.side === "buy" ? trade.amountIn : trade.amountOut;
	return getRenderableAmount(fallbackAmount, getQuoteTokenDecimals(trade, token));
};

const getQuoteAmount = (trade: ApiTrade, token: IToken) => {
	return (
		getRenderableAmount(trade.quoteAmount, getQuoteTokenDecimals(trade, token)) ?? getInferredQuoteAmount(trade, token)
	);
};

const getQuoteTokenSymbol = (trade: ApiTrade, token: IToken) => {
	const rowLevelSymbol = normalizeText(trade.quoteTokenSymbol).toUpperCase();
	if (rowLevelSymbol) return rowLevelSymbol;

	const tokenLevelSymbol = normalizeText((token as TokenWithQuoteSymbol).quoteTokenSymbol).toUpperCase();
	return tokenLevelSymbol;
};

const getTradeSemanticKeys = (trade: ApiTrade) => {
	if (trade.side === "buy") {
		return {
			tokenLabelKey: "token.trades.semantics.received",
			quoteLabelKey: "token.trades.semantics.quotePaid",
		};
	}

	return {
		tokenLabelKey: "token.trades.semantics.sold",
		quoteLabelKey: "token.trades.semantics.quoteReceived",
	};
};

const getUnavailableQuoteLabelKey = (trade: ApiTrade) => {
	if (trade.stale) return "token.trades.unavailable.stale";
	if (isBackfillTrade(trade)) return "token.trades.unavailable.historical";
	if (isExternalTrade(trade)) return "token.trades.unavailable.quoteSideMissing";
	return "token.trades.unavailable.quoteUnavailable";
};

const getDerivedPrice = (trade: ApiTrade, token: IToken) => {
	if (!hasVerifiedQuoteAmount(trade, token)) return null;

	const tokenAmount = getTokenAmount(trade, token);
	const quoteAmount = getQuoteAmount(trade, token);
	if (!tokenAmount || !quoteAmount) return null;

	const parsedTokenAmount = Number(tokenAmount);
	const parsedQuoteAmount = Number(quoteAmount);
	if (!Number.isFinite(parsedTokenAmount) || !Number.isFinite(parsedQuoteAmount)) return null;
	if (parsedTokenAmount <= 0 || parsedQuoteAmount <= 0) return null;

	return parsedQuoteAmount / parsedTokenAmount;
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
export default function TradesClient({ token, initialData }: { token: IToken; initialData: any }) {
	const { t } = useTranslation();
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
	const hasHistoricalRows = data.some((trade) => hasHistoricalContext(trade));
	const hasExternalRows = data.some((trade) => isExternalTrade(trade));
	const isStaleExternalFeed = Boolean(
		hasExternalMarket && latestTradeDate && Date.now() - latestTradeDate.getTime() > staleFeedMs,
	);
	const shouldCollapseByDefault = isStaleExternalFeed || hasHistoricalRows || hasExternalRows;
	const [isExpanded, setIsExpanded] = useState(!shouldCollapseByDefault);
	const [showAllRows, setShowAllRows] = useState(false);

	const visibleTrades = useMemo(() => {
		if (!isExpanded) return [];
		if (showAllRows) return data;
		return data.slice(0, DEFAULT_VISIBLE_ROWS);
	}, [data, isExpanded, showAllRows]);

	const hiddenTradeCount = Math.max(data.length - DEFAULT_VISIBLE_ROWS, 0);
	const summary = isStaleExternalFeed
		? {
				badge: t("token.trades.badge.historical"),
				title: t("token.trades.title.history"),
				description: latestTradeDate
					? t("token.trades.summary.historicalWithTime", { time: fromNow(latestTradeDate) })
					: t("token.trades.summary.historical"),
				footer: latestTradeDate
					? t("token.trades.footer.historicalWithTime", { time: fromNow(latestTradeDate) })
					: t("token.trades.footer.historical"),
				icon: History,
			}
		: hasExternalRows
			? {
					badge: t("token.trades.badge.third-party"),
					title: t("token.trades.title.activity"),
					description: latestTradeDate
						? t("token.trades.summary.externalWithTime", { time: fromNow(latestTradeDate) })
						: t("token.trades.summary.third-party"),
					footer: latestTradeDate
						? t("token.trades.footer.externalWithTime", { time: fromNow(latestTradeDate) })
						: t("token.trades.footer.externalWithCount", { count: String(data.length) }),
					icon: Radio,
				}
			: hasHistoricalRows
				? {
						badge: t("token.trades.badge.partial"),
						title: t("token.trades.title.history"),
						description: t("token.trades.summary.partial"),
						footer: t("token.trades.footer.partialWithCount", { count: String(data.length) }),
						icon: History,
					}
				: {
						badge: t("token.trades.badge.live"),
						title: t("token.trades.title.history"),
						description: t("token.trades.summary.live"),
						footer: t("token.trades.footer.liveWithCount", { count: String(data.length) }),
						icon: Radio,
					};

	if (!data.length) {
		if (hasExternalMarket) {
			return (
				<div className="rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] px-4 py-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div className="space-y-1.5">
							<div className="flex items-center gap-2">
								<History className="size-4 text-[#71717a]" />
								<div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#a1a1aa]">
									{t("token.trades.unavailableHeading")}
								</div>
							</div>
							<p className="max-w-2xl text-sm leading-relaxed text-[#71717a]">
								{t("token.trades.unavailableBody", { ticker: token.ticker })}
							</p>
						</div>
						{externalMarketUrl ? (
							<Link
								href={externalMarketUrl}
								target="_blank"
								className="inline-flex items-center gap-1 self-start rounded-sm border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#a1a1aa] transition-colors hover:border-[#00ff87]/25 hover:text-[#00ff87]"
							>
								{t("token.trades.liveMarket")}
								<ExternalLink className="size-3" />
							</Link>
						) : null}
					</div>
				</div>
			);
		}

		return <div className="w-full p-4 py-8 text-center text-sm text-[#a1a1aa]">{t("token.trades.noTradesYet")}</div>;
	}

	const SummaryIcon = summary.icon;

	return (
		<div className="space-y-3">
			<div className="rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#111114] px-4 py-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<SummaryIcon className="size-4 text-[#71717a]" />
							<div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#a1a1aa]">{summary.title}</div>
							<span
								className={cn(
									"rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]",
									summary.badge === t("token.trades.badge.live")
										? "border-[#00ff87]/20 bg-[#00ff87]/8 text-[#00ff87]"
										: "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#71717a]",
								)}
							>
								{summary.badge}
							</span>
						</div>
						<p className="max-w-3xl text-sm leading-relaxed text-[#71717a]">{summary.description}</p>
					</div>

					<div className="flex shrink-0 items-center gap-2 self-start">
						{externalMarketUrl ? (
							<Link
								href={externalMarketUrl}
								target="_blank"
								className="inline-flex items-center gap-1 rounded-sm border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#a1a1aa] transition-colors hover:border-[#00ff87]/25 hover:text-[#00ff87]"
							>
								{t("token.trades.liveMarket")}
								<ExternalLink className="size-3" />
							</Link>
						) : null}
						<button
							type="button"
							onClick={() => setIsExpanded((current) => !current)}
							className="inline-flex items-center gap-1 rounded-sm border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#a1a1aa] transition-colors hover:border-[rgba(255,255,255,0.14)] hover:text-[#e4e4e7]"
						>
							{isExpanded ? t("token.trades.hideHistory") : t("token.trades.showHistory")}
							{isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
						</button>
					</div>
				</div>
			</div>

			{isExpanded ? (
				<div className="space-y-3">
					<Table id="trades">
						<TableHeader>
							<TableRow>
								<TableHead className={cn(headerClass, "w-[100px]")}>{t("token.trades.headers.account")}</TableHead>
								<TableHead className={cn(headerClass, "text-center")}>{t("token.trades.headers.type")}</TableHead>
								<TableHead className={headerClass}>{t("token.trades.headers.tokenAmount")}</TableHead>
								<TableHead className={headerClass}>{t("token.trades.headers.quoteSide")}</TableHead>
								<TableHead className={headerClass}>{t("token.trades.headers.price")}</TableHead>
								<TableHead className={cn(headerClass, "w-12 text-right")}>{t("token.trades.headers.date")}</TableHead>
								<TableHead className="w-5 text-right" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleTrades.map((trade: ApiTrade) => {
								const isBuy = trade.side === "buy";
								const tokenAmount = getTokenAmount(trade, token);
								const quoteAmount = getQuoteAmount(trade, token);
								const quoteTokenSymbol = getQuoteTokenSymbol(trade, token);
								const usdValue = normalizeText(trade.usdValue);
								const showQuoteAmount = hasVerifiedQuoteAmount(trade, token);
								const derivedPrice = getDerivedPrice(trade, token);
								const semantics = getTradeSemanticKeys(trade);
								const unavailableQuoteLabel = t(getUnavailableQuoteLabelKey(trade));
								const sideLabel = isBuy ? t("token.trades.sideBuy") : t("token.trades.sideSell");

								return (
									<TableRow
										key={trade.id || `${trade.txHash}-${trade.blockNumber}`}
										className={cn(
											isBuy ? "bg-[#00ff87]/[0.015]" : "bg-[#ef4444]/[0.015]",
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
												<span className={isBuy ? "text-[#00ff87]" : "text-red-400"}>{sideLabel}</span>
											</div>
										</TableCell>
										<TableCell>
											<div className="flex flex-col">
												{tokenAmount ? (
													<span className="font-mono text-sm text-[#e4e4e7]">
														{formatAmount(tokenAmount)} {token.ticker}
													</span>
												) : (
													<span className="font-mono text-sm text-[#71717a]">-</span>
												)}
												<span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717a]">
													{t("token.trades.tokenLabelPrefix")} {t(semantics.tokenLabelKey)}
												</span>
											</div>
										</TableCell>
										<TableCell>
											<div className="flex flex-col">
												{showQuoteAmount && quoteAmount ? (
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
														<span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717a]">
															{t(semantics.quoteLabelKey)}
														</span>
													</>
												) : (
													<>
														<span className="font-mono text-sm text-[#71717a]">
															{t("token.trades.unavailable.unavailable")}
														</span>
														<span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717a]">
															{unavailableQuoteLabel}
														</span>
													</>
												)}
											</div>
										</TableCell>
										<TableCell>
											<div className="flex flex-col">
												{derivedPrice && quoteTokenSymbol ? (
													<>
														<span className="font-mono text-sm text-[#a1a1aa]">
															{formatAmount(derivedPrice, derivedPrice >= 1 ? 6 : 8)} {quoteTokenSymbol}
														</span>
														<span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717a]">
															{t("token.trades.perTicker", { ticker: token.ticker })}
														</span>
													</>
												) : (
													<>
														<span className="font-mono text-sm text-[#71717a]">
															{t("token.trades.unavailable.unavailable")}
														</span>
														<span className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#71717a]">
															{t("token.trades.unavailable.notDerived")}
														</span>
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
					</Table>

					<div className="flex flex-col gap-2 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="text-xs uppercase tracking-[0.16em] text-[#71717a]">{summary.footer}</div>
						{hiddenTradeCount > 0 ? (
							<button
								type="button"
								onClick={() => setShowAllRows((current) => !current)}
								className="inline-flex items-center gap-1 self-start font-mono text-[10px] uppercase tracking-[0.16em] text-[#a1a1aa] transition-colors hover:text-[#e4e4e7]"
							>
								{showAllRows
									? t("token.trades.showLess")
									: t("token.trades.showMore", { count: String(hiddenTradeCount) })}
								{showAllRows ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
							</button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
