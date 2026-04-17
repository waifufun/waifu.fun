import { cn } from "@/lib/utils";
import type { AgentTrade } from "./types";

export default function RecentActivity({ trades }: { trades: AgentTrade[] }) {
	if (!trades || trades.length === 0) {
		return (
			<div className="border border-white/10 bg-[#08080a] rounded-sm p-8 text-center">
				<div className="text-sm text-white/40">no trades yet</div>
				<div className="text-[11px] font-mono text-white/25 mt-1.5">
					this agent is waiting for its first move
				</div>
			</div>
		);
	}

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm divide-y divide-white/5 overflow-hidden">
			{trades.slice(0, 20).map((trade, idx) => (
				<a
					key={`${trade.txId || idx}-${trade.timestamp}`}
					href={
						trade.txId
							? `https://bscscan.com/tx/${trade.txId}`
							: undefined
					}
					target="_blank"
					rel="noreferrer"
					className={cn(
						"flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors text-[11px] font-mono",
						!trade.txId && "pointer-events-none",
					)}
				>
					<span
						className={cn(
							"inline-flex items-center justify-center h-5 px-1.5 rounded-sm text-[9px] uppercase tracking-[0.18em] shrink-0 w-10",
							trade.type === "buy"
								? "bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30"
								: "bg-red-500/10 text-red-400 border border-red-500/30",
						)}
					>
						{trade.type}
					</span>

					<span className="text-white/60 w-24 truncate">
						{shortenAddr(trade.address)}
					</span>

					<span className="flex-1 text-white/80 truncate text-right">
						{formatAmount(trade.amount)}
					</span>

					<span className="text-white/30 w-16 text-right shrink-0">
						{timeAgo(trade.timestamp)}
					</span>
				</a>
			))}
		</div>
	);
}

function shortenAddr(addr: string): string {
	if (!addr) return "—";
	if (addr.length < 14) return addr;
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatAmount(raw: string | number | undefined): string {
	if (raw === undefined || raw === null) return "—";
	const n = typeof raw === "string" ? Number(raw) : raw;
	if (!Number.isFinite(n)) return String(raw);
	if (n === 0) return "0";
	if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
	if (Math.abs(n) < 0.01) return n.toExponential(2);
	return n.toFixed(3);
}

function timeAgo(ts: number): string {
	if (!ts) return "—";
	const ms = ts > 1e12 ? ts : ts * 1000;
	const diff = Date.now() - ms;
	if (diff < 0) return "now";
	const s = Math.floor(diff / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	const d = Math.floor(h / 24);
	return `${d}d`;
}
