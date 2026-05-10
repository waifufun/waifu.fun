"use client";

import { ArrowDownLeft, ArrowUpRight, ExternalLink } from "lucide-react";

import type { PostLaunchMarket } from "@/hooks/use-post-launch-market";

/**
 * TradeActivityFeed, buys / sells per window, sourced from DEXScreener's
 * pair-level `txns` aggregates (5m / 1h / 6h / 24h).
 *
 * DEXScreener's public endpoints don't expose individual trade detail,
 * only window aggregates, so this surfaces a compact "activity ledger"
 * with a buy / sell ratio bar per window. The "full feed" link routes to
 * DEXScreener for the granular tape.
 */

type Props = {
	market: PostLaunchMarket | null;
	tokenAddress: string;
	isLoading: boolean;
};

const WINDOWS: Array<{
	key: keyof NonNullable<PostLaunchMarket["txns"]>;
	volumeKey: keyof NonNullable<PostLaunchMarket["volume"]>;
	label: string;
}> = [
	{ key: "m5", volumeKey: "m5", label: "5m" },
	{ key: "h1", volumeKey: "h1", label: "1h" },
	{ key: "h6", volumeKey: "h6", label: "6h" },
	{ key: "h24", volumeKey: "h24", label: "24h" },
];

export function TradeActivityFeed({ market, tokenAddress, isLoading }: Props) {
	const link = market?.pairUrl ?? `https://dexscreener.com/bsc/${tokenAddress.toLowerCase()}`;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm">
			<div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">trade activity</div>
				<a
					href={link}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 hover:text-[#00ff87] transition-colors"
				>
					full feed <ExternalLink className="w-3 h-3" />
				</a>
			</div>
			{isLoading && !market ? (
				<EmptyRow text="loading activity\u2026" />
			) : !market ? (
				<EmptyRow text="no pair indexed yet" />
			) : (
				<ul className="divide-y divide-white/5">
					{WINDOWS.map((w) => {
						const txns = market.txns?.[w.key] ?? {};
						const buys = Number(txns.buys ?? 0);
						const sells = Number(txns.sells ?? 0);
						const total = buys + sells;
						const buyShare = total > 0 ? (buys / total) * 100 : 50;
						const volume = num(market.volume?.[w.volumeKey]);
						return (
							<li key={w.key} className="grid grid-cols-[48px_1fr_96px] items-center gap-4 px-5 py-3">
								<span className="font-mono text-xs uppercase tracking-[0.2em] text-white/45">{w.label}</span>
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-xs">
										<span className="inline-flex items-center gap-1 text-[#00ff87]">
											<ArrowDownLeft className="w-3 h-3" /> {buys.toLocaleString()} buys
										</span>
										<span className="inline-flex items-center gap-1 text-orange-300/85">
											<ArrowUpRight className="w-3 h-3" /> {sells.toLocaleString()} sells
										</span>
									</div>
									<div className="flex h-1 w-full overflow-hidden border border-white/10 bg-[#111114]">
										<div className="h-full bg-[#00ff87]/70" style={{ width: `${buyShare}%` }} />
										<div className="h-full bg-orange-300/70" style={{ width: `${100 - buyShare}%` }} />
									</div>
								</div>
								<span className="text-right font-mono text-xs tabular-nums text-white/75">{formatUsd(volume)}</span>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function EmptyRow({ text }: { text: string }) {
	return (
		<div className="px-5 py-8 text-center text-[11px] font-mono uppercase tracking-[0.2em] text-white/40">{text}</div>
	);
}

function num(value: unknown): number | null {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

function formatUsd(value: number | null): string {
	if (value === null || !Number.isFinite(value) || value <= 0) return "–";
	if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}m`;
	if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
	if (value >= 1) return `$${value.toFixed(2)}`;
	return `$${value.toPrecision(2)}`;
}
