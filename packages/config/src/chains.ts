import { z } from "zod";

export type HexAddress = `0x${string}`;
export type ChainNetwork = "mainnet" | "testnet";

export interface ChainRegistryEntry {
	readonly id: number;
	readonly key: string;
	readonly network: ChainNetwork;
	readonly name: string;
	readonly explorerUrl: string;
	readonly nativeCurrency: {
		readonly name: string;
		readonly symbol: string;
		readonly decimals: number;
	};
	readonly defaultRpcUrl: string;
	readonly flap: {
		readonly portalAddress: HexAddress;
		readonly standardTokenImplementation: HexAddress;
		readonly taxTokenV1Implementation: HexAddress;
		readonly taxTokenV2Implementation: HexAddress;
		readonly uploadApiUrl: string;
		readonly vanitySuffix: {
			readonly standard: "8888";
			readonly tax: "7777";
		};
	};
}

export const CHAIN_REGISTRY = {
	bsc: {
		id: 56,
		key: "bsc",
		network: "mainnet",
		name: "BNB Smart Chain",
		explorerUrl: "https://bscscan.com",
		nativeCurrency: {
			name: "BNB",
			symbol: "BNB",
			decimals: 18,
		},
		defaultRpcUrl: "https://bsc-dataseed.binance.org",
		flap: {
			portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
			standardTokenImplementation: "0x8b4329947e34b6d56d71a3385cac122bade7d78d",
			taxTokenV1Implementation: "0x29e6383F0ce68507b5A72a53c2B118a118332aA8",
			taxTokenV2Implementation: "0xae562c6A05b798499507c6276C6Ed796027807BA",
			uploadApiUrl: "https://funcs.flap.sh/api/upload",
			vanitySuffix: {
				standard: "8888",
				tax: "7777",
			},
		},
	},
	bscTestnet: {
		id: 97,
		key: "bscTestnet",
		network: "testnet",
		name: "BNB Smart Chain Testnet",
		explorerUrl: "https://testnet.bscscan.com",
		nativeCurrency: {
			name: "BNB",
			symbol: "tBNB",
			decimals: 18,
		},
		defaultRpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
		flap: {
			portalAddress: "0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9",
			standardTokenImplementation: "0x87D5f292ba33011997641C7a7Bd2b17799aaA814",
			taxTokenV1Implementation: "0x87d8D03d0c3E064ACdb48E42fecbE8a8538dE6Fc",
			taxTokenV2Implementation: "0x2486e3ff5502bac48D2D86457e7c24B2bB0dDDb5",
			uploadApiUrl: "https://funcs.flap.sh/api/upload",
			vanitySuffix: {
				standard: "8888",
				tax: "7777",
			},
		},
	},
} as const satisfies Record<string, ChainRegistryEntry>;

export type ChainKey = keyof typeof CHAIN_REGISTRY;
export type SupportedChainId = 56 | 97;

export const CHAIN_KEYS = Object.keys(CHAIN_REGISTRY) as ChainKey[];
export const SUPPORTED_CHAIN_IDS = Object.values(CHAIN_REGISTRY).map((chain) => chain.id) as SupportedChainId[];

export const chainKeySchema = z.enum(["bsc", "bscTestnet"]);
export const supportedChainIdSchema = z.union([z.literal(56), z.literal(97)]);

export const DEFAULT_CHAIN_KEY: ChainKey = "bsc";
export const DEFAULT_CHAIN_ID: SupportedChainId = CHAIN_REGISTRY[DEFAULT_CHAIN_KEY].id;

const CHAIN_CONFIGS_BY_ID: Record<SupportedChainId, (typeof CHAIN_REGISTRY)[ChainKey]> = {
	56: CHAIN_REGISTRY.bsc,
	97: CHAIN_REGISTRY.bscTestnet,
};

export function isSupportedChainId(value: number): value is SupportedChainId {
	return value in CHAIN_CONFIGS_BY_ID;
}

export function getChainConfig(input: SupportedChainId | ChainKey = DEFAULT_CHAIN_ID) {
	if (typeof input === "string") {
		return CHAIN_REGISTRY[input];
	}

	const chain = CHAIN_CONFIGS_BY_ID[input];

	if (!chain) {
		throw new Error(`Unsupported chain id: ${input}`);
	}

	return chain;
}

export function getChainConfigByKey(key: ChainKey = DEFAULT_CHAIN_KEY) {
	return getChainConfig(key);
}

export function getChainConfigById(chainId: SupportedChainId = DEFAULT_CHAIN_ID) {
	return getChainConfig(chainId);
}
