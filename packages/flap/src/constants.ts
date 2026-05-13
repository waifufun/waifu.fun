import { env } from "@waifufun/config";
import { parseEther, zeroAddress } from "viem";
import { bsc, bscTestnet } from "viem/chains";

import {
	FLAP_DEX_IDS,
	FLAP_MIGRATOR_TYPES,
	FLAP_TOKEN_STATUSES,
	FLAP_TOKEN_VERSIONS,
	FLAP_V3_LP_FEE_PROFILES,
	type FlapDexThreshType,
} from "./types.js";

export const FLAP_BSC_MAINNET_CHAIN_ID = 56;
export const FLAP_BSC_TESTNET_CHAIN_ID = 97;

export const FLAP_DEFAULT_DEX_THRESH_TYPE = 0 as const satisfies FlapDexThreshType;
export const FLAP_DEFAULT_QUOTE_TOKEN = zeroAddress;
export const FLAP_PROTOCOL_FEE_BPS = 100;
export const FLAP_PROGRESS_WAD_ONE = 10n ** 18n;

/**
 * Documented default applied by Flap indexer guidance when TokenDexSupplyThreshSet
 * is missing from a creation transaction.
 */
export const FLAP_DOCUMENTED_DEFAULT_DEX_SUPPLY_THRESH = parseEther("667000000");

/**
 * Documented current BSC bonding-curve target from Flap docs. This is useful as
 * a display/reference constant, but callers should still prefer getTokenV7 or
 * indexed events over hardcoding it for live token state.
 */
export const FLAP_BSC_CURRENT_DEX_MIGRATION_SUPPLY_TARGET = parseEther("800000000");
export const FLAP_BSC_CURRENT_CURVE_PARAMS = {
	r: parseEther("6.14"),
	h: parseEther("107036752"),
	k: parseEther("6797205657.28"),
} as const;

export const FLAP_UPLOAD_API_URL = "https://funcs.flap.sh/api/upload" as const;
export const FLAP_IPFS_GATEWAY_URL = "https://flap.mypinata.cloud/ipfs" as const;

export const FLAP_BSC_MAINNET = {
	key: "bsc",
	chainId: FLAP_BSC_MAINNET_CHAIN_ID,
	chain: bsc,
	portalVersion: "v5.8.6",
	portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
	vaultPortalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
	splitVaultFactoryAddress: "0xfab75Dc774cB9B38b91749B8833360B46a52345F",
	standardTokenImplementation: "0x8b4329947e34b6d56d71a3385cac122bade7d78d",
	// TOKEN_TAXED V1, used by legacy Portal.newTokenV2. Do not use for newTokenV6.
	taxTokenV1Implementation: "0x29e6383F0ce68507b5A72a53c2B118a118332aA8",
	taxTokenV2Implementation: "0xae562c6A05b798499507c6276C6Ed796027807BA",
	// TOKEN_TAXED_V3, used by Portal.newTokenV6/newTokenV6WithVault.
	taxTokenV3Implementation: "0x024f18294970B5c76c0691b87f138A0317156422",
	standardVanitySuffix: "8888",
	taxVanitySuffix: "7777",
	uploadApiUrl: FLAP_UPLOAD_API_URL,
	ipfsGatewayUrl: FLAP_IPFS_GATEWAY_URL,
} as const;

export const FLAP_BSC_TESTNET = {
	key: "bscTestnet",
	chainId: FLAP_BSC_TESTNET_CHAIN_ID,
	chain: bscTestnet,
	portalVersion: "v5.8.5",
	portalAddress: "0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9",
	vaultPortalAddress: "0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9",
	splitVaultFactoryAddress: "0x1ae091F75D593eb7dC6539600a185C8A6076A424",
	standardTokenImplementation: "0x87D5f292ba33011997641C7a7Bd2b17799aaA814",
	taxTokenV1Implementation: "0x87d8D03d0c3E064ACdb48E42fecbE8a8538dE6Fc",
	taxTokenV2Implementation: "0x2486e3ff5502bac48D2D86457e7c24B2bB0dDDb5",
	standardVanitySuffix: "8888",
	taxVanitySuffix: "7777",
	uploadApiUrl: FLAP_UPLOAD_API_URL,
	ipfsGatewayUrl: FLAP_IPFS_GATEWAY_URL,
} as const;

export const FLAP_NETWORKS = {
	bsc: FLAP_BSC_MAINNET,
	bscTestnet: FLAP_BSC_TESTNET,
} as const;

export type FlapNetworkKey = keyof typeof FLAP_NETWORKS;
export type FlapNetworkConfig = (typeof FLAP_NETWORKS)[FlapNetworkKey];
export type FlapChainId = FlapNetworkConfig["chainId"];

export const FLAP_CHAIN_IDS = {
	bsc: FLAP_BSC_MAINNET_CHAIN_ID,
	bscTestnet: FLAP_BSC_TESTNET_CHAIN_ID,
} as const;

export const FLAP_PORTAL_ADDRESS = env.FLAP_PORTAL_ADDRESS;
export const FLAP_VAULT_PORTAL_ADDRESS = {
	bsc: FLAP_BSC_MAINNET.vaultPortalAddress,
	bscTestnet: FLAP_BSC_TESTNET.vaultPortalAddress,
} as const;
export const FLAP_SPLIT_VAULT_FACTORY_ADDRESS = {
	bsc: FLAP_BSC_MAINNET.splitVaultFactoryAddress,
	bscTestnet: FLAP_BSC_TESTNET.splitVaultFactoryAddress,
} as const;
export const FLAP_EVENT_NAMES = [
	"TokenCreated",
	"TokenBought",
	"TokenSold",
	"FlapTokenProgressChanged",
	"LaunchedToDEX",
	"TokenCurveSet",
	"TokenCurveSetV2",
	"TokenDexSupplyThreshSet",
	"TokenQuoteSet",
	"TokenMigratorSet",
	"TokenVersionSet",
	"FlapTokenTaxSet",
	"TokenExtensionEnabled",
	"TokenDexPreferenceSet",
	"FlapTokenStaged",
	"FlapTaxVaultTokenCreated",
	"FlapTokenCirculatingSupplyChanged",
] as const;

export const FLAP_READ_METHOD_NAMES = ["getTokenV7", "quoteExactInput"] as const;
export const FLAP_WRITE_METHOD_NAMES = ["newTokenV5", "newTokenV6WithVault", "swapExactInput"] as const;

export const FLAP_STATUS_LABELS: Record<number, string> = {
	[FLAP_TOKEN_STATUSES.INVALID]: "Invalid",
	[FLAP_TOKEN_STATUSES.TRADABLE]: "Tradable",
	[FLAP_TOKEN_STATUSES.IN_DUEL]: "InDuel",
	[FLAP_TOKEN_STATUSES.KILLED]: "Killed",
	[FLAP_TOKEN_STATUSES.DEX]: "DEX",
	[FLAP_TOKEN_STATUSES.STAGED]: "Staged",
};

export const FLAP_TOKEN_VERSION_LABELS: Record<number, string> = {
	[FLAP_TOKEN_VERSIONS.TOKEN_LEGACY_MINT_NO_PERMIT]: "TOKEN_LEGACY_MINT_NO_PERMIT",
	[FLAP_TOKEN_VERSIONS.TOKEN_LEGACY_MINT_NO_PERMIT_DUPLICATE]: "TOKEN_LEGACY_MINT_NO_PERMIT_DUPLICATE",
	[FLAP_TOKEN_VERSIONS.TOKEN_V2_PERMIT]: "TOKEN_V2_PERMIT",
	[FLAP_TOKEN_VERSIONS.TOKEN_GOPLUS]: "TOKEN_GOPLUS",
	[FLAP_TOKEN_VERSIONS.TOKEN_TAXED]: "TOKEN_TAXED",
	[FLAP_TOKEN_VERSIONS.TOKEN_TAXED_V2]: "TOKEN_TAXED_V2",
	[FLAP_TOKEN_VERSIONS.TOKEN_TAXED_V3]: "TOKEN_TAXED_V3",
};

export const FLAP_V3_LP_FEE_PROFILE_LABELS: Record<number, string> = {
	[FLAP_V3_LP_FEE_PROFILES.STANDARD]: "LP_FEE_PROFILE_STANDARD",
	[FLAP_V3_LP_FEE_PROFILES.LOW]: "LP_FEE_PROFILE_LOW",
	[FLAP_V3_LP_FEE_PROFILES.HIGH]: "LP_FEE_PROFILE_HIGH",
};

export const FLAP_DEX_ID_LABELS: Record<number, string> = {
	[FLAP_DEX_IDS.DEX0]: "DEX0",
	[FLAP_DEX_IDS.DEX1]: "DEX1",
	[FLAP_DEX_IDS.DEX2]: "DEX2",
};

export const FLAP_MIGRATOR_TYPE_LABELS: Record<number, string> = {
	[FLAP_MIGRATOR_TYPES.V3_MIGRATOR]: "V3_MIGRATOR",
	[FLAP_MIGRATOR_TYPES.V2_MIGRATOR]: "V2_MIGRATOR",
};

export const getFlapNetworkByKey = (key: FlapNetworkKey = "bsc"): FlapNetworkConfig => FLAP_NETWORKS[key];

export const getFlapNetworkByChainId = (chainId: number = env.BSC_CHAIN_ID): FlapNetworkConfig => {
	const network = Object.values(FLAP_NETWORKS).find((candidate) => candidate.chainId === chainId);

	if (!network) {
		throw new Error(`Unsupported Flap chain id: ${chainId}`);
	}

	return network;
};

export const resolveFlapNetwork = (input?: {
	chainId?: number;
	network?: FlapNetworkKey;
}): FlapNetworkConfig => {
	if (input?.network) {
		return getFlapNetworkByKey(input.network);
	}

	return getFlapNetworkByChainId(input?.chainId ?? env.BSC_CHAIN_ID);
};

export const resolveFlapIpfsUrl = (cid: string, gatewayUrl = FLAP_IPFS_GATEWAY_URL) =>
	`${gatewayUrl.replace(/\/$/, "")}/${cid}`;
