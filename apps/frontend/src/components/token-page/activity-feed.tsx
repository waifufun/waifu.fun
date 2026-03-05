"use client";
import type { IToken } from "@waifufun/types";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";

interface MockTrade { type: "buy" | "sell"; amount: string; ticker: string; time: string; }

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

function TradeCard({ trade, index }: { trade: MockTrade; index: number }) {
	const isBuy = trade.type === "buy";
	return (
		<motion.div initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ delay: index * 0.05, type: "spring", stiffness: 400, damping: 25 }} whileHover={{ scale: 1.02, y: -1 }} className={cn("relative flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-sm text-xs font-mono whitespace-nowrap cursor-default", "bg-[#111114] border transition-all duration-200", isBuy ? "border-[#22c55e]/20 hover:border-[#22c55e]/40 hover:shadow-[0_0_12px_rgba(34,197,94,0.1)]" : "border-red-500/20 hover:border-red-500/40 hover:shadow-[0_0_12px_rgba(239,68,68,0.1)]")}>
			<div className={cn("absolute left-0 top-0 bottom-0 w-0.5 rounded-l-sm", isBuy ? "bg-[#22c55e]" : "bg-red-500")} />
			{isBuy ? <TrendingUp className="size-3.5 text-[#22c55e]" /> : <TrendingDown className="size-3.5 text-red-400" />}
			<span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm", isBuy ? "text-[#22c55e] bg-[#22c55e]/10" : "text-red-400 bg-red-500/10")}>{isBuy ? "buy" : "sell"}</span>
			<span className="text-[#e4e4e7] font-medium">{trade.amount}</span>
			<span className="text-[#3f3f46]">→</span>
			<span className={cn("font-semibold", isBuy ? "text-[#22c55e]" : "text-red-400")}>{trade.ticker}</span>
			<span className="text-[#3f3f46] text-[10px] ml-1">{trade.time}</span>
		</motion.div>
	);
}

export default function ActivityFeed({ token }: { token: IToken }) {
	const trades = useMemo(() => generateMockTrades(token.ticker), [token.ticker]);
	if (!trades || trades.length === 0) {
		return (
			<div className="w-full">
				<div className="flex items-center gap-2 mb-2"><Zap className="size-3.5 text-[#52525b]" /><span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">recent activity</span></div>
				<div className="flex items-center justify-center py-6 px-4 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm"><p className="text-xs text-[#52525b] font-mono">no recent trades</p></div>
			</div>
		);
	}
	return (
		<div className="w-full overflow-hidden">
			<div className="flex items-center gap-2 mb-2">
				<div className="relative flex items-center justify-center"><span className="absolute h-3 w-3 rounded-full bg-[#00ff87]/30 animate-ping" /><span className="relative h-1.5 w-1.5 rounded-full bg-[#00ff87] shadow-[0_0_6px_rgba(0,255,135,0.6)]" /></div>
				<span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider">recent activity</span>
				<span className="text-[9px] text-[#3f3f46] font-mono">{trades.length} trades</span>
			</div>
			<div className="relative">
				<div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#08080a] to-transparent z-10 pointer-events-none" />
				<div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#08080a] to-transparent z-10 pointer-events-none" />
				<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none px-2">{trades.map((trade, i) => (<TradeCard key={`${trade.type}-${i}`} trade={trade} index={i} />))}</div>
			</div>
		</div>
	);
}
