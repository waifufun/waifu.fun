import { http, type Chain, type PublicClient, createPublicClient, fallback } from "viem";
import { arbitrum, base, bsc, mainnet, optimism, polygon } from "viem/chains";
import type { EvmNavChain } from "./types.js";

export type NavChainConfig = {
	key: EvmNavChain;
	chainId: number;
	nativeSymbol: string;
	coingeckoPlatform: string;
	coingeckoNativeId: string;
	rpcUrls: () => string[];
	viemChain: Chain;
};

const env = (name: string) => process.env[name]?.trim() || undefined;

function alchemyUrl(network: string): string | undefined {
	const key = env("ALCHEMY_API_KEY");
	return key ? `https://${network}.g.alchemy.com/v2/${key}` : undefined;
}

function compact(values: Array<string | undefined>): string[] {
	return values.filter((value): value is string => Boolean(value));
}

export const NAV_CHAIN_CONFIG: Record<EvmNavChain, NavChainConfig> = {
	bsc: {
		key: "bsc",
		chainId: 56,
		nativeSymbol: "BNB",
		coingeckoPlatform: "binance-smart-chain",
		coingeckoNativeId: "binancecoin",
		viemChain: bsc,
		rpcUrls: () =>
			compact([
				env("BSC_RPC_URL"),
				env("ALCHEMY_BSC_URL"),
				env("ALCHEMY_BSC_KEY") ? `https://bnb-mainnet.g.alchemy.com/v2/${env("ALCHEMY_BSC_KEY")}` : undefined,
				alchemyUrl("bnb-mainnet"),
				"https://bsc-dataseed.binance.org",
			]),
	},
	eth: {
		key: "eth",
		chainId: 1,
		nativeSymbol: "ETH",
		coingeckoPlatform: "ethereum",
		coingeckoNativeId: "ethereum",
		viemChain: mainnet,
		rpcUrls: () => compact([env("ETH_RPC_URL"), env("MAINNET_RPC_URL"), alchemyUrl("eth-mainnet")]),
	},
	arb: {
		key: "arb",
		chainId: 42161,
		nativeSymbol: "ETH",
		coingeckoPlatform: "arbitrum-one",
		coingeckoNativeId: "ethereum",
		viemChain: arbitrum,
		rpcUrls: () => compact([env("ARB_RPC_URL"), env("ARBITRUM_RPC_URL"), alchemyUrl("arb-mainnet")]),
	},
	base: {
		key: "base",
		chainId: 8453,
		nativeSymbol: "ETH",
		coingeckoPlatform: "base",
		coingeckoNativeId: "ethereum",
		viemChain: base,
		rpcUrls: () => compact([env("BASE_RPC_URL"), alchemyUrl("base-mainnet")]),
	},
	op: {
		key: "op",
		chainId: 10,
		nativeSymbol: "ETH",
		coingeckoPlatform: "optimistic-ethereum",
		coingeckoNativeId: "ethereum",
		viemChain: optimism,
		rpcUrls: () => compact([env("OP_RPC_URL"), env("OPTIMISM_RPC_URL"), alchemyUrl("opt-mainnet")]),
	},
	polygon: {
		key: "polygon",
		chainId: 137,
		nativeSymbol: "MATIC",
		coingeckoPlatform: "polygon-pos",
		coingeckoNativeId: "matic-network",
		viemChain: polygon,
		rpcUrls: () => compact([env("POLYGON_RPC_URL"), alchemyUrl("polygon-mainnet")]),
	},
};

export function isEvmNavChain(chain: string): chain is EvmNavChain {
	return chain in NAV_CHAIN_CONFIG;
}

export function getNavPublicClient(chain: EvmNavChain): PublicClient {
	const config = NAV_CHAIN_CONFIG[chain];
	if (!config) throw new Error(`Unsupported EVM NAV chain: ${chain}`);
	const urls = config.rpcUrls();
	if (urls.length === 0) throw new Error(`No RPC provider configured for ${chain}`);
	return createPublicClient({
		chain: config.viemChain,
		transport: fallback(urls.map((url) => http(url))),
	}) as PublicClient;
}
