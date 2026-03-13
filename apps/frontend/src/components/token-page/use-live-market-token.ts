"use client";

import { useQuery } from "@tanstack/react-query";
import { EvmChainIds, type IToken, SolanaNetworkIds } from "@waifufun/types";
import { useMemo } from "react";

export type LiveMarketSource = "dexscreener" | null;

type DexPairResponse = {
	pair?: DexPair;
	pairs?: DexPair[];
};

type DexPair = {
	priceUsd?: string | number;
	marketCap?: string | number;
	fdv?: string | number;
	volume?: {
		h24?: string | number;
	};
};

const migratedStatuses = new Set(["migrated", "dex", "locked"]);

const getDexScreenerChainName = (token: IToken): string | null => {
	if (token.chain === "evm") {
		switch (Number(token.chainId)) {
			case EvmChainIds.BscMainnet:
				return "bsc";
			case EvmChainIds.BaseMainnet:
				return "base";
			case EvmChainIds.EthereumMainnet:
				return "ethereum";
			default:
				return null;
		}
	}

	if (token.chain === "solana" && Number(token.chainId) === SolanaNetworkIds.Mainnet) {
		return "solana";
	}

	return null;
};

const toFiniteNumber = (value: unknown): number | null => {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const shouldUseDexScreenerMarket = (token: IToken) => {
	const tokenWithOrigin = token as IToken & { origin?: string };
	const normalizedStatus = String(token?.status ?? "")
		.trim()
		.toLowerCase();
	return (
		Boolean(token?.pool) &&
		(Boolean(token?.imported) || tokenWithOrigin?.origin === "imported" || migratedStatuses.has(normalizedStatus))
	);
};

const fetchDexScreenerPair = async ({
	chain,
	pool,
}: {
	chain: string;
	pool: string;
}) => {
	const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${pool}`, {
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`DexScreener pair lookup failed (${response.status})`);
	}

	const data = (await response.json()) as DexPairResponse;
	const pair = data?.pair ?? data?.pairs?.[0];

	if (!pair) {
		return null;
	}

	return {
		price: toFiniteNumber(pair.priceUsd),
		volume24h: toFiniteNumber(pair.volume?.h24),
		marketcap: toFiniteNumber(pair.marketCap) ?? toFiniteNumber(pair.fdv),
	};
};

export function useLiveMarketToken(token: IToken) {
	const dexChain = getDexScreenerChainName(token);
	const shouldFetchDexMarket = Boolean(dexChain) && shouldUseDexScreenerMarket(token);

	const query = useQuery({
		queryKey: ["token-live-market", token.chain, token.chainId, token.contractAddress, token.pool, dexChain],
		queryFn: async () => {
			if (!dexChain || !token.pool) return null;
			return await fetchDexScreenerPair({ chain: dexChain, pool: token.pool });
		},
		enabled: shouldFetchDexMarket,
		staleTime: 10_000,
		refetchInterval: 15_000,
		retry: 1,
	});

	const liveMarketToken = useMemo(() => {
		const market = query.data;
		if (!market) return token;

		return {
			...token,
			price: market.price && market.price > 0 ? market.price : token.price,
			volume24h: market.volume24h !== null && market.volume24h >= 0 ? market.volume24h : token.volume24h,
			marketcap: market.marketcap && market.marketcap > 0 ? market.marketcap : token.marketcap,
		} satisfies IToken;
	}, [query.data, token]);

	return {
		token: liveMarketToken,
		marketDataSource: query.data ? ("dexscreener" as const) : null,
		isExternalMarketToken: shouldFetchDexMarket,
		liveMarketData: query.data ?? null,
	};
}
