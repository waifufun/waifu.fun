"use client";

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTrades } from "@/lib/api";
import type { IToken } from "@waifufun/types";
import { ExternalLink } from "lucide-react";
import { cn, shortenAddress } from "@/lib/utils";
import Triangle from "../triangle";
import { CHAIN_TO_BLOCK_EXPLORER_URL } from "@waifufun/constants";
import Link from "next/link";
import TimeAgo from "../time-ago";
import { useQuery } from "@tanstack/react-query";

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

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export default function TradesClient({ token, initialData }: { token: IToken; initialData: any }) {
	const nonAnimatedTrades = Array.from(new Set<string>(initialData?.map((a: ApiTrade) => a.txHash)));
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

	const data = query?.data as ApiTrade[] | undefined;

	if (!data || data?.length === 0) {
		return (
			<div className="p-4 py-8 text-center w-full text-sm text-[#a1a1aa]">
				There are currently no trades.
			</div>
		);
	}

	return (
		<Table id="trades">
			<TableHeader>
				<TableRow>
					<TableHead className="w-[100px]">Account</TableHead>
					<TableHead className="text-center">Type</TableHead>
					<TableHead>Amount</TableHead>
					<TableHead className="w-12 text-right">Date</TableHead>
					<TableHead className="w-5 text-right" />
				</TableRow>
			</TableHeader>
			<TableBody>
				{data.map((trade: ApiTrade) => (
					<TableRow
						key={trade.txHash}
						className={cn([
							!nonAnimatedTrades.includes(trade.txHash)
								? "animate-shake animate-once animate-duration-200 animate-ease-linear"
								: "",
						])}
					>
						<TableCell className="hover:text-[#00ff87] font-medium">
							<Link href={`/profile/${trade.traderAddress}`}>
								{trade.traderAddress ? shortenAddress(trade.traderAddress) : "-"}
							</Link>
						</TableCell>
						<TableCell>
							<Triangle direction={trade?.side === "buy" ? "up" : "down"} />
						</TableCell>
						<TableCell>
							<div className="flex items-center gap-2">
								{new Intl.NumberFormat("en-US", {
									maximumFractionDigits: 2,
								}).format(Number(trade.amountIn))}{" "}
								{token.ticker}
							</div>
						</TableCell>
						<TableCell className="text-right">{trade?.timestamp ? <TimeAgo date={trade?.timestamp} /> : "-"}</TableCell>
						<TableCell>
							<Link
								href={`${CHAIN_TO_BLOCK_EXPLORER_URL[token.chain]?.[token.chainId] ?? ""}/tx/${trade.txHash}`}
								target="_blank"
							>
								<ExternalLink className="ml-auto size-4 text-[#00ff87]" />
							</Link>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
			<TableFooter className="border-t-2 border-[#00ff87]/25">
				<TableRow>
					<TableCell colSpan={5}>
						<div className="text-[#71717a] text-xs uppercase text-center mx-auto w-full">
							Live Feed - Showing last {data?.length || 0} trades
						</div>
					</TableCell>
				</TableRow>
			</TableFooter>
		</Table>
	);
}
