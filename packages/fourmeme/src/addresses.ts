import type { Address } from "viem";
import { bsc, bscTestnet } from "viem/chains";

export const FOURMEME_BSC_MAINNET_CHAIN_ID = 56;
export const FOURMEME_BSC_TESTNET_CHAIN_ID = 97;

/**
 * Four.Meme contract addresses.
 *
 * Mainnet addresses sourced from Four.Meme gitbook (2026-04-16). Testnet addresses
 * are placeholders (`zero-address-like` `null`) pending official confirmation — the
 * Four.Meme docs do not publish testnet deployments. Callers that need testnet
 * support must override these via `createFourMemeClient({ addresses: { ... } })`.
 */
export interface FourMemeAddresses {
	tokenManager: Address;
	tokenManager2: Address;
	tokenManagerHelper3: Address;
	agentIdentifier: Address;
	/** WBNB on the active chain — used as default quote for BNB-paired tokens. */
	wrappedNative: Address;
}

export const FOURMEME_ADDRESSES_BSC_MAINNET: FourMemeAddresses = {
	tokenManager: "0xEC4549caDcE5DA21Df6E6422d448034B5233bFbC",
	tokenManager2: "0x5c952063c7fc8610FFDB798152D69F0B9550762b",
	tokenManagerHelper3: "0xF251F83e40a78868FcfA3FA4599Dad6494E46034",
	agentIdentifier: "0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13",
	wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
} as const;

/**
 * BSC testnet addresses are not officially documented by Four.Meme. These default to
 * the mainnet values so the type system compiles, but any client pointed at chain 97
 * MUST supply its own `addresses` override — otherwise it will try to call mainnet
 * contracts from a testnet chain and revert.
 */
export const FOURMEME_ADDRESSES_BSC_TESTNET: FourMemeAddresses = {
	...FOURMEME_ADDRESSES_BSC_MAINNET,
	wrappedNative: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
} as const;

export const FOURMEME_NETWORKS = {
	bsc: {
		key: "bsc" as const,
		chain: bsc,
		chainId: FOURMEME_BSC_MAINNET_CHAIN_ID,
		addresses: FOURMEME_ADDRESSES_BSC_MAINNET,
	},
	bscTestnet: {
		key: "bscTestnet" as const,
		chain: bscTestnet,
		chainId: FOURMEME_BSC_TESTNET_CHAIN_ID,
		addresses: FOURMEME_ADDRESSES_BSC_TESTNET,
	},
} as const;

export type FourMemeNetworkKey = keyof typeof FOURMEME_NETWORKS;
export type FourMemeNetworkConfig = (typeof FOURMEME_NETWORKS)[FourMemeNetworkKey];
export type FourMemeChainId = typeof FOURMEME_BSC_MAINNET_CHAIN_ID | typeof FOURMEME_BSC_TESTNET_CHAIN_ID;

export const getFourMemeNetwork = (key: FourMemeNetworkKey): FourMemeNetworkConfig => FOURMEME_NETWORKS[key];
