"use client";
import type { IToken } from "@waifufun/types";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface MockTrade {
	type: "buy" | "sell";
	amount: string;
	ticker: string;
	time: string;
}

function generateMockTrades(ticker: string): MockTrade[] {
	return [
		{ type: "buy", amount: "0.5 SOL", ticker, time: "2m ago" },
		{ type: "sell", amount: "2.1 SOL", ticker, time: "5m ago" },
		{ type: "buy", amount: "1.2 SOL", ticker, time: "8m ago" },
		{ type: "buy", amount: "0.3 SOL", ticker, time: "12m ago" },
		{ type: "sell", amount: "0.8 SOL", ticker, time: "15m ago" },
		{ type: "buy", amount: "3.0 SOL", ticker, time: "22m ago" },
		{ type: "sell", amount: "1.5 SOL", ticker, time: "31m ago" },
		{ type: "buy", amount: "0.7 SOL", ticker, time: "45m ago" },
	];
}

export default function ActivityFeed({ token }: { token: IToken }) {
	const trades = useMemo(() => generateMockTrades(token.ticker), [token.ticker]);

	return (
		<div className="w-full overflow-hidden">
			<div className="flex items-center gap-2 mb-2">
				<div className="h-1.5 w-1.5 rounded-full bg-[#00ff87] animate-pulse" />
				<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">
					recent activity
				</span>
			</div>
			<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
				{trades.map((trade, i) => (
					<div
						key={`${trade.type}-${i}`}
						className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm text-xs font-mono whitespace-nowrap"
					>
						<span
							className={cn(
								"text-[10px] font-bold uppercase",
								trade.type === "buy" ? "text-[#22c55e]" : "text-red-400",
							)}
						>
							{trade.type === "buy" ? "bought" : "sold"}
						</span>
						<span className="text-[#a1a1aa]">{trade.amount}</span>
						<span className="text-[#52525b]">of</span>
						<span className="text-[#e4e4e7]">{trade.ticker}</span>
						<span className="text-[#3f3f46] ml-1">{trade.time}</span>
					</div>
				))}
			</div>
		</div>
	);
}
