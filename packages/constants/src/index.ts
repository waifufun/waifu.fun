import { EvmChainIds, type EvmAddressLike, type TChain, type TSupportProtocol, type FALModels } from "@autofun/types";
import { getAddress, type Abi, type Chain } from "viem";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import { SolanaNetworkIds } from "@autofun/types";
import dotenv from "dotenv";
import type { ClusterUrl } from "@solana/kit";
import uniswapv2 from "./abis/uniswap-v2.json";
import uniswapv3 from "./abis/uniswap-v3.json";
import uniswapv4 from "./abis/uniswap-v4.json";

dotenv.config();

export const ABIS: Record<TSupportProtocol, Abi> = {
	uniswapv2: uniswapv2 as Abi,
	uniswapv3: uniswapv3 as Abi,
	uniswapv4: uniswapv4 as Abi,
};

/** Universal Router */
export const UNISWAP_V4_ADDRESSES: Record<EvmChainIds, EvmAddressLike> = {
	[EvmChainIds.EthereumMainnet]: getAddress("0x66a9893cc07d91d95644aedd05d03f95e1dba8af"),
	[EvmChainIds.EthereumSepolia]: getAddress("0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b"),
	[EvmChainIds.BaseMainnet]: getAddress("0x6ff5693b99212da76ad316178a184ab56d299b43"),
	[EvmChainIds.BaseSepolia]: getAddress("0x492e6456d9528771018deb9e87ef7750ef184104"),
};

export const WETH_ADDRESSES: Record<EvmChainIds, EvmAddressLike> = {
	[EvmChainIds.EthereumMainnet]: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
	[EvmChainIds.EthereumSepolia]: getAddress("0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"),
	[EvmChainIds.BaseMainnet]: getAddress("0x4200000000000000000000000000000000000006"),
	[EvmChainIds.BaseSepolia]: getAddress("0x4200000000000000000000000000000000000006"),
};

export const CHAINID_TO_VIEM_CHAIN: Record<EvmChainIds, Chain> = {
	[EvmChainIds.EthereumMainnet]: mainnet,
	[EvmChainIds.EthereumSepolia]: sepolia,
	[EvmChainIds.BaseMainnet]: base,
	[EvmChainIds.BaseSepolia]: baseSepolia,
};

export const alchemyApiKey = process.env.ALCHEMY_API_KEY;
export const heliusApiKey = process.env.HELIUS_API_KEY;

export const EVM_RPC_URLS: Record<EvmChainIds, string[]> = {
	[EvmChainIds.EthereumMainnet]: [...(alchemyApiKey ? [`https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`] : [])],
	[EvmChainIds.EthereumSepolia]: [...(alchemyApiKey ? [`https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`] : [])],
	[EvmChainIds.BaseMainnet]: [...(alchemyApiKey ? [`https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`] : [])],
	[EvmChainIds.BaseSepolia]: [...(alchemyApiKey ? [`https://base-sepolia.g.alchemy.com/v2/${alchemyApiKey}`] : [])],
};

export const SOLANA_RPC_URLS: Record<SolanaNetworkIds, ClusterUrl[]> = {
	[SolanaNetworkIds.Mainnet]: [...(heliusApiKey ? [`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`] : []),
	"",
	"",
	"",

],
	[SolanaNetworkIds.Devnet]: [...(heliusApiKey ? [`https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`] : [])],
};

export const CHAINID_TO_SYMBOL: {
	[K in TChain]: Record<K extends "evm" ? EvmChainIds : SolanaNetworkIds, string | undefined>;
} = {
	evm: {
		[EvmChainIds.EthereumMainnet]: "ETH",
		[EvmChainIds.EthereumSepolia]: "ETH",
		[EvmChainIds.BaseMainnet]: "ETH",
		[EvmChainIds.BaseSepolia]: "ETH",
	},
	solana: {
		[SolanaNetworkIds.Mainnet]: "SOL",
		[SolanaNetworkIds.Devnet]: "SOL",
	},
};

export const CHAINID_TO_DEXSCREENER_NAME: {
	[K in TChain]: Record<K extends "evm" ? EvmChainIds : SolanaNetworkIds, string | undefined>;
} = {
	evm: {
		[EvmChainIds.EthereumMainnet]: "ethereum",
		[EvmChainIds.EthereumSepolia]: undefined,
		[EvmChainIds.BaseMainnet]: "base",
		[EvmChainIds.BaseSepolia]: undefined,
	},
	solana: {
		[SolanaNetworkIds.Mainnet]: "solana",
		[SolanaNetworkIds.Devnet]: undefined,
	},
};

export const CHAINID_TO_CODEX_NETWORK_ID: {
	[K in TChain]: Record<K extends "evm" ? EvmChainIds : SolanaNetworkIds, number | undefined>;
} = {
	evm: {
		[EvmChainIds.EthereumMainnet]: 1,
		[EvmChainIds.EthereumSepolia]: 11155111,
		[EvmChainIds.BaseMainnet]: 8453,
		[EvmChainIds.BaseSepolia]: 84532,
	},
	solana: {
		[SolanaNetworkIds.Mainnet]: 1399811149,
		[SolanaNetworkIds.Devnet]: undefined,
	},
};

export const falApiKey = process.env.FAL_API_KEY;

export const FAL_MODELS: FALModels = {
	image: {
		fast: "fal-ai/flux/schnell",
		ultra: "fal-ai/flux-pro/v1.1-ultra",
	},
	llm: {
		gemini: "google/gemini-flash-1.5",
	},
	audio: {
		mmaudiov2: "fal-ai/mmaudio-v2/text-to-audio",
	},
	video: {
		klingVideo: "fal-ai/kling-video/v2/master/text-to-video",
	},
};
