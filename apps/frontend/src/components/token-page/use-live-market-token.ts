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
	chainId?: string;
	pairAddress?: string;
	priceUsd?: string | number;
	marketCap?: string | number;
	fdv?: string | number;
	volume?: {
		h24?: string | number;
	};
	liquidity?: {
		usd?: string | number;
	};
	baseToken?: {
		address?: string;
	};
	quoteToken?: {
		address?: string;
	};
};

type DexMarketData = {
	price: number | null;
	volume24h: number | null;
	marketcap: number | null;
	pool: string | null;
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

const normalizeAddress = (value: unknown) =>
	String(value ?? "")
		.trim()
		.toLowerCase();

const shouldUseDexScreenerMarket = (token: IToken) => {
	const tokenWithOrigin = token as IToken & { origin?: string };
	const normalizedStatus = String(token?.status ?? "")
		.trim()
		.toLowerCase();
	return (
		Boolean(token?.contractAddress) &&
		(Boolean(token?.imported) || tokenWithOrigin?.origin === "imported" || migratedStatuses.has(normalizedStatus))
	);
};

const mapDexPairToMarket = (pair: DexPair): DexMarketData => ({
	price: toFiniteNumber(pair.priceUsd),
	volume24h: toFiniteNumber(pair.volume?.h24),
	marketcap: toFiniteNumber(pair.marketCap) ?? toFiniteNumber(pair.fdv),
	pool: typeof pair.pairAddress === "string" && pair.pairAddress.length > 0 ? pair.pairAddress : null,
});

const fetchDexScreenerJson = async (url: string): Promise<DexPairResponse | null> => {
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		if (response.status === 404) {
			return null;
		}

		throw new Error(`DexScreener lookup failed (${response.status})`);
	}

	return (await response.json()) as DexPairResponse;
};

const fetchDexScreenerPair = async ({
	chain,
	pool,
}: {
	chain: string;
	pool: string;
}): Promise<DexMarketData | null> => {
	const data = await fetchDexScreenerJson(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${pool}`);
	const pair = data?.pair ?? data?.pairs?.[0];
	return pair ? mapDexPairToMarket(pair) : null;
};

const selectDexScreenerPair = ({
	pairs,
	chain,
	tokenAddress,
}: {
	pairs: DexPair[];
	chain: string;
	tokenAddress: string;
}) => {
	const normalizedTokenAddress = normalizeAddress(tokenAddress);
	const matchingPairs = pairs.filter((pair) => {
		if (pair?.chainId !== chain) return false;
		const baseTokenAddress = normalizeAddress(pair?.baseToken?.address);
		const quoteTokenAddress = normalizeAddress(pair?.quoteToken?.address);
		return baseTokenAddress === normalizedTokenAddress || quoteTokenAddress === normalizedTokenAddress;
	});

	return (
		matchingPairs.sort((left, right) => {
			const leftBaseMatch = normalizeAddress(left?.baseToken?.address) === normalizedTokenAddress ? 1 : 0;
			const rightBaseMatch = normalizeAddress(right?.baseToken?.address) === normalizedTokenAddress ? 1 : 0;
			if (leftBaseMatch !== rightBaseMatch) return rightBaseMatch - leftBaseMatch;

			const liquidityDelta = (toFiniteNumber(right?.liquidity?.usd) ?? 0) - (toFiniteNumber(left?.liquidity?.usd) ?? 0);
			if (liquidityDelta !== 0) return liquidityDelta;

			return (toFiniteNumber(right?.volume?.h24) ?? 0) - (toFiniteNumber(left?.volume?.h24) ?? 0);
		})[0] ?? null
	);
};

const fetchDexScreenerTokenMarket = async ({
	chain,
	tokenAddress,
}: {
	chain: string;
	tokenAddress: string;
}): Promise<DexMarketData | null> => {
	const data = await fetchDexScreenerJson(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
	const pair = selectDexScreenerPair({
		pairs: data?.pairs ?? [],
		chain,
		tokenAddress,
	});

	return pair ? mapDexPairToMarket(pair) : null;
};

export function useLiveMarketToken(token: IToken) {
	const dexChain = getDexScreenerChainName(token);
	const shouldFetchDexMarket = Boolean(dexChain) && shouldUseDexScreenerMarket(token);

	const query = useQuery({
		queryKey: ["token-live-market", token.chain, token.chainId, token.contractAddress, token.pool, dexChain],
		queryFn: async () => {
			if (!dexChain || !token.contractAddress) return null;

			if (token.pool) {
				const marketByPool = await fetchDexScreenerPair({ chain: dexChain, pool: token.pool });
				if (marketByPool) {
					return marketByPool;
				}
			}

			return await fetchDexScreenerTokenMarket({
				chain: dexChain,
				tokenAddress: token.contractAddress,
			});
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
			...((market.pool ?? token.pool) ? { pool: market.pool ?? token.pool } : {}),
		} satisfies IToken;
	}, [query.data, token]);

	return {
		token: liveMarketToken,
		marketDataSource: query.data ? ("dexscreener" as const) : null,
		isExternalMarketToken: shouldFetchDexMarket,
		liveMarketData: query.data ?? null,
	};
}
