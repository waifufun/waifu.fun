"use client";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface TradeItem {
	agentTicker: string;
	agentName: string;
	type: "buy" | "sell";
	amount: string;
	timestamp: number;
}

function useTimeAgo() {
	const { t } = useTranslation();
	return (ts: number): string => {
		const diff = Math.max(0, Date.now() - ts);
		const s = Math.floor(diff / 1000);
		if (s < 60) return t("discover.landing.tradeAgoSeconds", { n: String(s) });
		const m = Math.floor(s / 60);
		if (m < 60) return t("discover.landing.tradeAgoMinutes", { n: String(m) });
		const h = Math.floor(m / 60);
		if (h < 24) return t("discover.landing.tradeAgoHours", { n: String(h) });
		return t("discover.landing.tradeAgoDays", { n: String(Math.floor(h / 24)) });
	};
}

export default function ActivityMarquee({ trades }: { trades: TradeItem[] }) {
	const { t } = useTranslation();
	const timeAgo = useTimeAgo();
	// force re-render every 20s so "Xm ago" stays fresh
	const [, setTick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setTick((t) => t + 1), 20_000);
		return () => clearInterval(id);
	}, []);

	if (!trades.length) return null;

	// duplicate list for seamless loop
	const items = [...trades, ...trades];

	return (
		<div className="relative overflow-hidden">
			<div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#050506] to-transparent z-10" />
			<div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#050506] to-transparent z-10" />
			<div className="flex gap-8 whitespace-nowrap animate-[waifu-marquee_45s_linear_infinite] will-change-transform">
				{items.map((trade, i) => (
					<div
						key={`${trade.agentTicker}-${trade.timestamp}-${i}`}
						className="flex items-center gap-2 text-[11px] font-mono"
					>
						<span
							className={cn(
								"inline-flex items-center gap-1.5",
								trade.type === "buy" ? "text-[#00ff87]" : "text-white/60",
							)}
						>
							<span className={cn("w-1 h-1 rounded-full", trade.type === "buy" ? "bg-[#00ff87]" : "bg-white/40")} />
							<span className="uppercase tracking-[0.18em]">${trade.agentTicker || trade.agentName.slice(0, 4)}</span>
						</span>
						<span className="text-white/50">
							{trade.type === "buy" ? t("discover.landing.tradeGotA") : t("discover.landing.tradeSold")} {trade.amount}{" "}
							BNB {trade.type === "buy" ? t("discover.landing.tradeBuy") : t("discover.landing.tradeSell")}
						</span>
						<span className="text-white/25 uppercase tracking-[0.18em]">{timeAgo(trade.timestamp)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
