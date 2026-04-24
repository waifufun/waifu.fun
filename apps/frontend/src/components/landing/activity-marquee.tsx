"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface TradeItem {
	agentTicker: string;
	agentName: string;
	type: "buy" | "sell";
	amount: string;
	timestamp: number;
}

function timeAgo(ts: number): string {
	const diff = Math.max(0, Date.now() - ts);
	const s = Math.floor(diff / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

export default function ActivityMarquee({ trades }: { trades: TradeItem[] }) {
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
				{items.map((t, i) => (
					<div key={`${t.agentTicker}-${t.timestamp}-${i}`} className="flex items-center gap-2 text-[11px] font-mono">
						<span
							className={cn("inline-flex items-center gap-1.5", t.type === "buy" ? "text-[#00ff87]" : "text-white/60")}
						>
							<span className={cn("w-1 h-1 rounded-full", t.type === "buy" ? "bg-[#00ff87]" : "bg-white/40")} />
							<span className="uppercase tracking-[0.18em]">${t.agentTicker || t.agentName.slice(0, 4)}</span>
						</span>
						<span className="text-white/50">
							{t.type === "buy" ? "got a" : "sold"} {t.amount} BNB {t.type}
						</span>
						<span className="text-white/25 uppercase tracking-[0.18em]">{timeAgo(t.timestamp)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
