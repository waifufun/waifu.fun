import { env } from "@waifufun/config";
import {
	http,
	type Address,
	type EIP1193Provider,
	type PublicClient,
	type Transport,
	type WalletClient,
	createPublicClient,
	createWalletClient,
	custom,
} from "viem";

import { portalAbi } from "./abi/portal.js";
import {
	FLAP_BSC_MAINNET_CHAIN_ID,
	FLAP_BSC_TESTNET_CHAIN_ID,
	type FlapChainId,
	type FlapNetworkConfig,
	type FlapNetworkKey,
	resolveFlapNetwork,
} from "./constants.js";

export interface CreateFlapPublicClientOptions {
	chainId?: FlapChainId;
	network?: FlapNetworkKey;
	rpcUrl?: string;
	transport?: Transport;
}

export interface CreateFlapWalletClientOptions {
	provider: EIP1193Provider;
	chainId?: FlapChainId;
	network?: FlapNetworkKey;
}

export interface GetPortalContractConfigOptions {
	chainId?: FlapChainId;
	network?: FlapNetworkKey;
	address?: Address;
}

const getDefaultRpcUrl = (network: FlapNetworkConfig) => {
	if (network.chainId === FLAP_BSC_MAINNET_CHAIN_ID) {
		return env.BSC_RPC_URL;
	}

	const rpcUrl = network.chain.rpcUrls.default.http[0];

	if (!rpcUrl) {
		throw new Error(`No default RPC URL configured for Flap network ${network.key}`);
	}

	return rpcUrl;
};

export const createFlapPublicClient = (options: CreateFlapPublicClientOptions = {}): PublicClient => {
	const network = resolveFlapNetwork(options);

	return createPublicClient({
		chain: network.chain,
		transport: options.transport ?? http(options.rpcUrl ?? getDefaultRpcUrl(network)),
	});
};

export const createFlapWalletClient = (options: CreateFlapWalletClientOptions): WalletClient => {
	const network = resolveFlapNetwork(options);

	return createWalletClient({
		chain: network.chain,
		transport: custom(options.provider),
	});
};

export const getPortalContractConfig = (options: GetPortalContractConfigOptions = {}) => {
	const network = resolveFlapNetwork(options);

	return {
		address: options.address ?? network.portalAddress,
		abi: portalAbi,
		chain: network.chain,
	} as const;
};

export const getFlapPortalAddress = (options: Omit<GetPortalContractConfigOptions, "address"> = {}) =>
	getPortalContractConfig(options).address;

export const isFlapTestnet = (chainId: number) => chainId === FLAP_BSC_TESTNET_CHAIN_ID;
