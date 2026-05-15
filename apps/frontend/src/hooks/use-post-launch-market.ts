"use client";

/**
 * Post-launch DEXScreener market snapshot for the v3 agent page (W50).
 *
 * Pulls the highest-liquidity bsc pair for the agent token, normalises the
 * fields we render (price, MC, 24h volume, 24h change, V2 LP depth) and
 * surfaces the pair address + URL for the chart embed and trade activity
 * feed. Mirrors the lookup pattern in `use-live-market-token.ts` but is
 * scoped to a single contract address (no `IToken` shape required).
 */

import { useQuery } from "@tanstack/react-query";

type DexPair = {
	chainId?: string;
	pairAddress?: string;
	priceUsd?: string | number;
	marketCap?: string | number;
	fdv?: string | number;
	volume?: { h24?: string | number; h6?: string | number; h1?: string | number; m5?: string | number };
	priceChange?: { h24?: string | number };
	liquidity?: { usd?: string | number };
	baseToken?: { address?: string };
	dexId?: string;
	url?: string;
	txns?: {
		m5?: { buys?: number; sells?: number };
		h1?: { buys?: number; sells?: number };
		h6?: { buys?: number; sells?: number };
		h24?: { buys?: number; sells?: number };
	};
};

export type PostLaunchMarket = {
	priceUsd: number | null;
	marketCap: number | null;
	volume24h: number | null;
	priceChange24h: number | null;
	liquidityUsd: number | null;
	pairAddress: string | null;
	pairUrl: string | null;
	dexId: string | null;
	txns: DexPair["txns"];
	volume: DexPair["volume"];
};

const num = (value: unknown): number | null => {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : null;
};

const REFETCH_MS = 15_000;

export function usePostLaunchMarket(tokenAddress: string | undefined, enabled = true) {
	return useQuery<PostLaunchMarket | null>({
		queryKey: ["post-launch-market", tokenAddress?.toLowerCase() ?? null],
		enabled: Boolean(tokenAddress) && enabled,
		refetchInterval: REFETCH_MS,
		staleTime: 5_000,
		queryFn: async () => {
			if (!tokenAddress) return null;
			const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
			const res = await fetch(url, { headers: { Accept: "application/json" } });
			if (!res.ok) {
				if (res.status === 404) return null;
				throw new Error(`dexscreener lookup failed (${res.status})`);
			}
			const data = (await res.json()) as { pairs?: DexPair[] };
			const pairs = (data?.pairs ?? []).filter((p) => p?.chainId === "bsc");
			if (pairs.length === 0) return null;

			const target = tokenAddress.toLowerCase();
			pairs.sort((a, b) => {
				const aBase = (a.baseToken?.address ?? "").toLowerCase() === target ? 1 : 0;
				const bBase = (b.baseToken?.address ?? "").toLowerCase() === target ? 1 : 0;
				if (aBase !== bBase) return bBase - aBase;
				return (num(b.liquidity?.usd) ?? 0) - (num(a.liquidity?.usd) ?? 0);
			});
			const pair = pairs[0];
			if (!pair) return null;

			return {
				priceUsd: num(pair.priceUsd),
				marketCap: num(pair.marketCap) ?? num(pair.fdv),
				volume24h: num(pair.volume?.h24),
				priceChange24h: num(pair.priceChange?.h24),
				liquidityUsd: num(pair.liquidity?.usd),
				pairAddress: pair.pairAddress ?? null,
				pairUrl: pair.url ?? null,
				dexId: pair.dexId ?? null,
				txns: pair.txns,
				volume: pair.volume,
			};
		},
	});
}
