"use client";
import type { IToken } from "@waifufun/types";
import { useMemo, useState } from "react";
import { cn, shortenAddress } from "@/lib/utils";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@waifufun/constants";

const PAGE_SIZE = 10;

interface MockTrade {
	type: "buy" | "sell";
	amount: string;
	ticker: string;
	wallet: string;
	txId: string;
	time: string;
}

const MOCK_WALLETS = [
	"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
	"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
	"5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
	"2wmVCSfPxGPjrnMMn7wthR6GspZbxz7PSoS2zi2N8D1e",
	"HKvaNR4vFdy4qT2E2E6pf8vQq2vCg5GRcFvqpXx6qWqL",
	"6FVbD7k3kHJV3xY6gT5nR8sP2mN9qL4wE1aB3cD6fG8hJ",
	"3nKj9mP2qR5sT8vX1yA4bC7eF0gH3jL6nP9rS2uW5xZ8",
	"8pQr4tU7wY0zA3cE6gI9kM2nP5rS8vX1zB4eH7jL0oR3u",
];

function generateMockTrades(ticker: string): MockTrade[] {
	return [
		{ type: "buy", amount: "0.5 SOL", ticker, wallet: MOCK_WALLETS[0]!, txId: "5Vv6kF3hJ9mN2pQr8sT1uW4xY7zAbC0dEfGhIjK", time: "2m ago" },
		{ type: "sell", amount: "2.1 SOL", ticker, wallet: MOCK_WALLETS[1]!, txId: "2AbC3dEfGhI6jKlM9nOpQrStUvWxYz", time: "5m ago" },
		{ type: "buy", amount: "1.2 SOL", ticker, wallet: MOCK_WALLETS[2]!, txId: "9pQr2sT4uVwXyZ0aBcDeFgHiJkLmN", time: "8m ago" },
		{ type: "buy", amount: "0.3 SOL", ticker, wallet: MOCK_WALLETS[3]!, txId: "7mNk5oPqRsTuVwXyZ2aBcDeFgHiJ", time: "12m ago" },
		{ type: "sell", amount: "0.8 SOL", ticker, wallet: MOCK_WALLETS[4]!, txId: "3fGh8jKlMnOpQrStUvWxYz1aBc", time: "15m ago" },
		{ type: "buy", amount: "3.0 SOL", ticker, wallet: MOCK_WALLETS[5]!, txId: "1bCd4eFgHiJkLmNoPqRsTuVwXy", time: "22m ago" },
		{ type: "sell", amount: "1.5 SOL", ticker, wallet: MOCK_WALLETS[6]!, txId: "6iJk9lMnOpQrStUvWxYzAbCdEf", time: "31m ago" },
		{ type: "buy", amount: "0.7 SOL", ticker, wallet: MOCK_WALLETS[7]!, txId: "4eFg7hIjKlMnOpQrStUvWxYz0a", time: "45m ago" },
	];
}

function TradeRow({ trade, index, token }: { trade: MockTrade; index: number; token: IToken }) {
	const isBuy = trade.type === "buy";
	const explorerBase = CHAIN_TO_BLOCK_EXPLORER_URL[token.chain]?.[token.chainId];
	const txUrl = explorerBase ? `${explorerBase}/tx/${trade.txId}` : null;

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ delay: index * 0.03 }}
			className={cn(
				"relative w-full grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(7rem,1fr)_auto_auto] items-center gap-4 px-4 py-2.5 text-xs font-mono border-b border-[rgba(255,255,255,0.04)] last:border-b-0 transition-colors",
				"bg-[#111114] hover:bg-[#18181c]",
			)}
		>
			<div className="flex items-center gap-2 min-w-0 w-[4.5rem]">
				{isBuy ? <TrendingUp className="size-3.5 shrink-0 text-[#22c55e]" /> : <TrendingDown className="size-3.5 shrink-0 text-red-400" />}
				<span
					className={cn(
						"text-[10px] font-bold uppercase px-1.5 py-0.5 shrink-0 w-8 text-center",
						isBuy ? "text-[#22c55e] bg-[#22c55e]/10" : "text-red-400 bg-red-500/10",
					)}
				>
					{isBuy ? "buy" : "sell"}
				</span>
			</div>
			<span className="text-[#e4e4e7] font-medium truncate text-left">{trade.amount}</span>
			<span className={cn("font-semibold truncate text-left min-w-0", isBuy ? "text-[#22c55e]" : "text-red-400")}>{trade.ticker}</span>
			<span className="min-w-0 overflow-hidden text-left">
				<Link
					href={`/profile/${trade.wallet}`}
					className="block text-[#a1a1aa] hover:text-[#00ff87] truncate font-mono text-[10px] transition-colors text-left"
					title={trade.wallet}
				>
					{shortenAddress(trade.wallet)}
				</Link>
			</span>
			<span className="text-[#52525b] text-[10px] text-right">{trade.time}</span>
			{txUrl ? (
				<Link
					href={txUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center justify-center w-8 h-8 text-[#52525b] hover:text-[#00ff87] transition-colors"
					title="View on explorer"
					aria-label="View transaction on explorer"
				>
					<ExternalLink className="size-4" />
				</Link>
			) : null}
		</motion.div>
	);
}

export default function ActivityFeed({ token }: { token: IToken }) {
	const trades = useMemo(() => generateMockTrades(token.ticker), [token.ticker]);
	const [page, setPage] = useState(1);

	if (!trades || trades.length === 0) {
		return (
			<div className="w-full border border-[rgba(255,255,255,0.06)] bg-[#111114]">
				<div className="flex items-center justify-center py-8 px-4">
					<p className="text-xs text-[#52525b] font-mono">no recent trades</p>
				</div>
			</div>
		);
	}

	const totalPages = Math.ceil(trades.length / PAGE_SIZE);
	const showPagination = totalPages > 1;
	const currentPage = showPagination ? Math.min(page, totalPages) : 1;
	const start = (currentPage - 1) * PAGE_SIZE;
	const pageTrades = showPagination ? trades.slice(start, start + PAGE_SIZE) : trades;

	return (
		<div className="w-full border border-[rgba(255,255,255,0.06)] bg-[#08080a] overflow-hidden">
			<div className="max-h-[280px] overflow-y-auto scrollbar-hide">
				{pageTrades.map((trade, i) => (
					<TradeRow
						key={`${trade.type}-${start + i}-${trade.time}`}
						trade={trade}
						index={start + i}
						token={token}
					/>
				))}
			</div>
			{showPagination && (
				<div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[rgba(255,255,255,0.06)] bg-[#111114]">
					<button
						type="button"
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						disabled={currentPage <= 1}
						className="inline-flex items-center gap-1 text-[10px] font-mono text-[#52525b] hover:text-[#00ff87] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						aria-label="Previous page"
					>
						<ChevronLeft className="size-4" />
						Prev
					</button>
					<span className="text-[10px] font-mono text-[#52525b]">
						Page {currentPage} of {totalPages}
					</span>
					<button
						type="button"
						onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						disabled={currentPage >= totalPages}
						className="inline-flex items-center gap-1 text-[10px] font-mono text-[#52525b] hover:text-[#00ff87] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						aria-label="Next page"
					>
						Next
						<ChevronRight className="size-4" />
					</button>
				</div>
			)}
		</div>
	);
}
