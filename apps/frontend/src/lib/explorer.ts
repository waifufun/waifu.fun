import { EvmChainIds } from "@waifufun/types";
import { DEFAULT_EVM_CHAIN_ID } from "@/providers/evm-provider";

export const EXPLORER_BY_CHAIN_ID: Record<EvmChainIds, string> = {
	[EvmChainIds.BscMainnet]: "https://bscscan.com",
	[EvmChainIds.BaseMainnet]: "https://basescan.org",
	[EvmChainIds.BaseSepolia]: "https://sepolia.basescan.org",
	[EvmChainIds.EthereumMainnet]: "https://etherscan.io",
	[EvmChainIds.EthereumSepolia]: "https://sepolia.etherscan.io",
};

export const resolveEvmChainId = (chainId?: number): EvmChainIds => {
	if (chainId && chainId in EXPLORER_BY_CHAIN_ID) {
		return chainId as EvmChainIds;
	}

	return DEFAULT_EVM_CHAIN_ID;
};

const getExplorerBaseUrl = (chainId?: number) => {
	return EXPLORER_BY_CHAIN_ID[resolveEvmChainId(chainId)] || EXPLORER_BY_CHAIN_ID[DEFAULT_EVM_CHAIN_ID];
};

export const getExplorerTxUrl = (hash: string, chainId?: number) => {
	return `${getExplorerBaseUrl(chainId)}/tx/${hash}`;
};

export const getExplorerAddressUrl = (address: string, chainId?: number) => {
	return `${getExplorerBaseUrl(chainId)}/address/${address}`;
};
