import { EvmChainIds, type EvmAddressLike, type TChain, type TSupportProtocol, type FALModels } from "@autofun/types";
import { getAddress, type Abi, type Chain, defineChain } from "viem";
import { base, baseSepolia, mainnet, sepolia, bsc, bscTestnet } from "viem/chains";
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
// Define Jeju chains
export const jejuMainnet = defineChain({
	id: 420691,
	name: "Jeju",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: { http: ["https://rpc.jeju.network"] },
	},
	blockExplorers: {
		default: { name: "Jeju Explorer", url: "https://explorer.jeju.network" },
	},
});

export const jejuTestnet = defineChain({
	id: 420690,
	name: "Jeju Testnet",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: { http: ["https://testnet-rpc.jeju.network"] },
	},
	blockExplorers: {
		default: { name: "Jeju Testnet Explorer", url: "https://testnet-explorer.jeju.network" },
	},
	testnet: true,
});

export const jejuLocalnet = defineChain({
	id: 1337,
	name: "Jeju Localnet",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: { http: [process.env.NEXT_PUBLIC_JEJU_RPC_URL || "http://127.0.0.1:9545"] },
	},
	blockExplorers: {
		default: { name: "Blockscout", url: "http://localhost:4000" },
	},
	testnet: true,
});

// Uniswap V4 / PancakeSwap addresses
// Jeju and BSC Testnet addresses are zero - contracts need deployment for full DEX functionality
// This is expected for MVP - token display/filtering works without DEX contracts
export const UNISWAP_V4_ADDRESSES: Record<EvmChainIds, EvmAddressLike> = {
	[EvmChainIds.EthereumMainnet]: getAddress("0x66a9893cc07d91d95644aedd05d03f95e1dba8af"),
	[EvmChainIds.EthereumSepolia]: getAddress("0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b"),
	[EvmChainIds.BaseMainnet]: getAddress("0x6ff5693b99212da76ad316178a184ab56d299b43"),
	[EvmChainIds.BaseSepolia]: getAddress("0x492e6456d9528771018deb9e87ef7750ef184104"),
	[EvmChainIds.JejuMainnet]: getAddress("0x0000000000000000000000000000000000000000"), // Deploy via scripts/deploy-uniswap-v4.ts when needed
	[EvmChainIds.JejuTestnet]: getAddress("0x0000000000000000000000000000000000000000"), // Deploy via scripts/deploy-uniswap-v4.ts when needed
	[EvmChainIds.JejuLocalnet]: getAddress("0x5FbDB2315678afecb367f032d93F642f64180aa3"), // V4 PoolManager deployed
	[EvmChainIds.BSCMainnet]: getAddress("0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"), // PancakeSwap V4
	[EvmChainIds.BSCTestnet]: getAddress("0x0000000000000000000000000000000000000000"), // Deploy when BSC testnet support needed
};

export const ELIZA_TOKEN_ADDRESSES: Partial<Record<EvmChainIds, EvmAddressLike>> = {
	[EvmChainIds.JejuMainnet]: getAddress("0x0000000000000000000000000000000000000000"), // Deploy via scripts/deploy-eliza-token.ts when needed
	[EvmChainIds.JejuTestnet]: getAddress("0x0000000000000000000000000000000000000000"), // Deploy via scripts/deploy-eliza-token.ts when needed
	[EvmChainIds.JejuLocalnet]: getAddress("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"), // Deployed to localnet
};

export const WETH_ADDRESSES: Record<EvmChainIds, EvmAddressLike> = {
	[EvmChainIds.EthereumMainnet]: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
	[EvmChainIds.EthereumSepolia]: getAddress("0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"),
	[EvmChainIds.BaseMainnet]: getAddress("0x4200000000000000000000000000000000000006"),
	[EvmChainIds.BaseSepolia]: getAddress("0x4200000000000000000000000000000000000006"),
	[EvmChainIds.JejuMainnet]: getAddress("0x4200000000000000000000000000000000000006"), // L2 Standard WETH
	[EvmChainIds.JejuTestnet]: getAddress("0x4200000000000000000000000000000000000006"),
	[EvmChainIds.JejuLocalnet]: getAddress("0x4200000000000000000000000000000000000006"),
	[EvmChainIds.BSCMainnet]: getAddress("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"), // WBNB
	[EvmChainIds.BSCTestnet]: getAddress("0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"), // WBNB Testnet
};

export const CHAINID_TO_VIEM_CHAIN: Record<EvmChainIds, Chain> = {
	[EvmChainIds.EthereumMainnet]: mainnet,
	[EvmChainIds.EthereumSepolia]: sepolia,
	[EvmChainIds.BaseMainnet]: base,
	[EvmChainIds.BaseSepolia]: baseSepolia,
	[EvmChainIds.JejuMainnet]: jejuMainnet,
	[EvmChainIds.JejuTestnet]: jejuTestnet,
	[EvmChainIds.JejuLocalnet]: jejuLocalnet,
	[EvmChainIds.BSCMainnet]: bsc,
	[EvmChainIds.BSCTestnet]: bscTestnet,
};

export const alchemyApiKey = process.env.ALCHEMY_API_KEY;
export const heliusApiKey = process.env.HELIUS_API_KEY;

export const EVM_RPC_URLS: Record<EvmChainIds, string[]> = {
	[EvmChainIds.EthereumMainnet]: [...(alchemyApiKey ? [`https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`] : [])],
	[EvmChainIds.EthereumSepolia]: [...(alchemyApiKey ? [`https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`] : [])],
	[EvmChainIds.BaseMainnet]: [...(alchemyApiKey ? [`https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`] : [])],
	[EvmChainIds.BaseSepolia]: [...(alchemyApiKey ? [`https://base-sepolia.g.alchemy.com/v2/${alchemyApiKey}`] : [])],
	[EvmChainIds.JejuMainnet]: ["https://rpc.jeju.network"],
	[EvmChainIds.JejuTestnet]: ["https://testnet-rpc.jeju.network"],
	[EvmChainIds.JejuLocalnet]: [process.env.JEJU_RPC_URL || "http://127.0.0.1:9545"],
	[EvmChainIds.BSCMainnet]: ["https://bsc-dataseed1.binance.org", "https://bsc-dataseed2.binance.org"],
	[EvmChainIds.BSCTestnet]: ["https://data-seed-prebsc-1-s1.binance.org:8545"],
};

export const SOLANA_RPC_URLS: Record<SolanaNetworkIds, ClusterUrl[]> = {
	[SolanaNetworkIds.Mainnet]: [...(heliusApiKey ? [`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`] : [])],
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
		[EvmChainIds.JejuMainnet]: "ETH",
		[EvmChainIds.JejuTestnet]: "ETH",
		[EvmChainIds.JejuLocalnet]: "ETH",
		[EvmChainIds.BSCMainnet]: "BNB",
		[EvmChainIds.BSCTestnet]: "BNB",
	},
	solana: {
		[SolanaNetworkIds.Mainnet]: "SOL",
		[SolanaNetworkIds.Devnet]: "SOL",
	},
};

export const CHAIN_TO_BLOCK_EXPLORER_URL: {
	[K in TChain]: Record<K extends "evm" ? EvmChainIds : SolanaNetworkIds, string | undefined>;
} = {
	evm: {
		[EvmChainIds.EthereumMainnet]: "https://etherscan.io",
		[EvmChainIds.EthereumSepolia]: "https://sepolia.etherscan.io",
		[EvmChainIds.BaseMainnet]: "https://basescan.org",
		[EvmChainIds.BaseSepolia]: "https://sepolia.basescan.org",
		[EvmChainIds.JejuMainnet]: "https://explorer.jeju.network",
		[EvmChainIds.JejuTestnet]: "https://testnet-explorer.jeju.network",
		[EvmChainIds.JejuLocalnet]: "http://localhost:4000",
		[EvmChainIds.BSCMainnet]: "https://bscscan.com",
		[EvmChainIds.BSCTestnet]: "https://testnet.bscscan.com",
	},
	solana: {
		[SolanaNetworkIds.Mainnet]: "https://solscan.io",
		[SolanaNetworkIds.Devnet]: "https://solscan.io/?cluster=devnet",
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
		[EvmChainIds.JejuMainnet]: "jeju",
		[EvmChainIds.JejuTestnet]: undefined,
		[EvmChainIds.JejuLocalnet]: undefined,
		[EvmChainIds.BSCMainnet]: "bsc",
		[EvmChainIds.BSCTestnet]: undefined,
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
		[EvmChainIds.JejuMainnet]: 420691,
		[EvmChainIds.JejuTestnet]: 420690,
		[EvmChainIds.JejuLocalnet]: undefined,
		[EvmChainIds.BSCMainnet]: 56,
		[EvmChainIds.BSCTestnet]: undefined,
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

export const FLEEK_API_URL = "https://api.fleek.xyz";

export const FALLBACK_PRICES = {
	solana: 153,
	ethereum: 2518,
};

export const virtualReservesConst = process.env.NETWORK === "devnet" ? 2800000000 : 28000000000;

export const curveLimitConst = process.env.NETWORK === "devnet" ? 11300000000 : 113000000000;
