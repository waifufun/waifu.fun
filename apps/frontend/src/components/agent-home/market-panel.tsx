/**
 * MarketPanel - consolidated on-chain market readout for a wave-M agent.
 *
 * Surfaces the numbers that were previously hidden because the agent card
 * upstream returns `—` for marketCap. We compute everything from public
 * data sources (DexScreener API + v2 pair reserves via wagmi) so the
 * panel works without any indexer or paid RPC.
 *
 * Fields:
 *   - market cap (FDV, since the token has no team vesting beyond 24h
 *     presaler vesting; FDV == circulating market cap once vesting
 *     completes — we label it "fdv / mc" to be honest about the period
 *     where they differ)
 *   - price per token (usd + bnb-denominated)
 *   - 24h volume (usd)
 *   - 24h price change (%)
 *   - v2 liquidity (usd) with link to the pair on bscscan
 *
 * Source: DexScreener gives us all of these at once for any BSC token
 * with a tradeable pair. No RPC cap concerns. We refetch every 15s via
 * the shared usePostLaunchMarket query.
 *
 * Visual: SurfaceCard with a 2x3 stat grid; matches the AgentTreasury /
 * TaxStream visual grammar (hairline dividers, font-mono micro-caps,
 * tabular-nums numbers, single accent #00ff87 on the change pill).
 */
"use client";

import { ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { isAddress } from "viem";

import { SurfaceCard } from "@/components/ui/surface-card";
import { usePostLaunchMarket } from "@/hooks/use-post-launch-market";
import type { AgentLaunchByToken } from "@/lib/post-launch/api";
import { cn } from "@/lib/utils";

export interface MarketPanelProps {
	tokenAddress: string;
	tokenSymbol: string;
	launch: AgentLaunchByToken | null;
}

/** Format a usd amount with mc-style suffixes (M / k). */
function fmtUsd(value: number | null): string {
	if (value === null || !Number.isFinite(value) || value === 0) return "—";
	const abs = Math.abs(value);
	if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
	if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
	if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}k`;
	if (abs >= 1) return `$${value.toFixed(2)}`;
	if (abs >= 0.01) return `$${value.toFixed(4)}`;
	return `$${value.toPrecision(2)}`;
}

/** Format a usd amount under $1 with extra precision, for token prices. */
function fmtPriceUsd(value: number | null): string {
	if (value === null || !Number.isFinite(value) || value === 0) return "—";
	const abs = Math.abs(value);
	if (abs >= 1) return `$${value.toFixed(4)}`;
	if (abs >= 0.0001) return `$${value.toFixed(6)}`;
	// preserve leading non-zero precision for ultra-low prices
	return `$${value.toPrecision(3)}`;
}

/** Format a 24h change percentage as ±x.xx%, color-coded by caller. */
function fmtPct(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return "—";
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(2)}%`;
}

export default function MarketPanel({ tokenAddress, tokenSymbol, launch }: MarketPanelProps) {
	const tokenValid = isAddress(tokenAddress);
	const market = usePostLaunchMarket(tokenValid ? tokenAddress : undefined, tokenValid);

	const v2Pair = launch?.v2Pair ?? null;
	const pairForLink = market.data?.pairAddress ?? v2Pair;

	if (!tokenValid) {
		return (
			<SurfaceCard padding="md">
				<div className="font-mono text-[11px] text-white/40">market data unavailable for this token</div>
			</SurfaceCard>
		);
	}

	const data = market.data;
	const loading = market.isLoading && !data;
	const noPair = !loading && !data;

	// MC vs FDV: dexscreener returns marketCap (which for fully-issued
	// supply == FDV). We label "fdv / mc" because for the first 24h the
	// presaler vesting cap means circulating < total, and we don't want
	// to claim a number we can't strictly justify.
	const fdv = data?.marketCap ?? null;
	const priceUsd = data?.priceUsd ?? null;
	const volume24h = data?.volume24h ?? null;
	const change24h = data?.priceChange24h ?? null;
	const liquidityUsd = data?.liquidityUsd ?? null;

	return (
		<SurfaceCard padding="none" className="overflow-hidden">
			<header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 md:px-6">
				<div className="flex flex-col gap-0.5 min-w-0">
					<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">market</span>
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">
						${tokenSymbol.toUpperCase()} on pancakeswap v2
					</span>
				</div>
				{pairForLink ? (
					<a
						href={`https://bscscan.com/address/${pairForLink}`}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 hover:text-[#00ff87] transition-colors"
						aria-label="open v2 pair on bscscan"
					>
						pair
						<ExternalLink className="h-3 w-3" strokeWidth={1.5} />
					</a>
				) : null}
			</header>

			{loading ? (
				<div className="px-5 py-6 md:px-6">
					<div className="h-6 w-40 animate-pulse rounded-sm bg-white/[0.04]" aria-label="loading market data" />
				</div>
			) : null}

			{noPair ? (
				<div className="px-5 py-6 text-center font-mono text-[11px] text-white/35 md:px-6">
					no liquid pair indexed yet
				</div>
			) : null}

			{data ? (
				<>
					{/* Top row: FDV + 24h change as the headline stats */}
					<div className="grid grid-cols-2 divide-x divide-white/[0.06] border-b border-white/[0.06]">
						<HeadlineStat label="fdv / mc" hint="fully diluted · 1b supply" value={fmtUsd(fdv)} />
						<HeadlineStat
							label="24h change"
							hint="usd-denominated"
							value={fmtPct(change24h)}
							tone={changeTone(change24h)}
							icon={changeIcon(change24h)}
						/>
					</div>

					{/* Bottom row: price / volume / liquidity */}
					<div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x sm:divide-white/[0.06] divide-y divide-white/[0.06] sm:divide-y-0">
						<StatCell label="price" hint="usd per token" value={fmtPriceUsd(priceUsd)} />
						<StatCell label="24h volume" hint="usd traded" value={fmtUsd(volume24h)} />
						<StatCell label="liquidity" hint="v2 pair tvl · usd" value={fmtUsd(liquidityUsd)} />
					</div>

					<footer className="border-t border-white/[0.06] bg-[#06060a] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/30 md:px-6">
						live · dexscreener · 15s refresh
					</footer>
				</>
			) : null}
		</SurfaceCard>
	);
}

function changeTone(value: number | null): "up" | "down" | "flat" {
	if (value === null || !Number.isFinite(value)) return "flat";
	if (value > 0) return "up";
	if (value < 0) return "down";
	return "flat";
}

function changeIcon(value: number | null) {
	if (value === null || !Number.isFinite(value)) return null;
	if (value > 0) return <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} />;
	if (value < 0) return <TrendingDown className="h-3.5 w-3.5" strokeWidth={1.5} />;
	return null;
}

function HeadlineStat({
	label,
	hint,
	value,
	tone = "flat",
	icon,
}: {
	label: string;
	hint: string;
	value: string;
	tone?: "up" | "down" | "flat";
	icon?: React.ReactNode;
}) {
	const valueClass = tone === "up" ? "text-[#00ff87]" : tone === "down" ? "text-[#ff5d4a]" : "text-white/90";
	return (
		<div className="flex flex-col gap-1.5 px-5 py-4 md:px-6">
			<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">{label}</span>
			<div className={cn("flex items-center gap-2 font-mono text-[20px] md:text-[22px] tabular-nums", valueClass)}>
				{icon}
				<span>{value}</span>
			</div>
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">{hint}</span>
		</div>
	);
}

function StatCell({ label, hint, value }: { label: string; hint: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 px-5 py-3.5 md:px-6">
			<span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">{label}</span>
			<span className="font-mono text-[14px] tabular-nums text-white/85">{value}</span>
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">{hint}</span>
		</div>
	);
}
