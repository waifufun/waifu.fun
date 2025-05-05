import { EvmChainIds, SolanaNetworkIds, type AddressLike, type IToken, type TChain } from "@autofun/types";
import { isAddress as isSolanaAddress } from "@solana/kit";
import { isAddress as isEvmAddress } from "viem";

/**
 * Determines the blockchain type (flavor) of a given address.
 *
 * @param address - The address to check
 * @returns {TChain | null} "solana" if it's a Solana address, "evm" if it's an EVM address, or null if neither
 */
export const getAddressFlavor = (address: AddressLike): TChain | null => {
	if (isSolanaAddress(address)) {
		return "solana";
	}
	if (isEvmAddress(address)) {
		return "evm";
	}
	return null;
};

/**
 * Checks if an address is supported by the system.
 *
 * @param address - The address to check for support
 * @returns {boolean} True if the address is a supported type (Solana or EVM), false otherwise
 */
export const isSupportedAddress = (address: AddressLike): boolean => {
	const flavor = getAddressFlavor(address);
	if (flavor) {
		return true;
	}
	return false;
};

/**
 * Validates if a chain ID is allowed for a specific blockchain type.
 *
 * @param chain - The blockchain type ("solana" or "evm")
 * @param chainId - The chain ID to validate
 * @returns True if the chain ID is valid for the specified blockchain type, false otherwise
 */
export const isChainIdAllowedForChain = (chain: TChain, chainId: Omit<IToken, "chainId">) => {
	if (!chain || !chainId) return false;
	if (chain === "solana") {
		const solanaChainIds = Object.values(SolanaNetworkIds);
		if (solanaChainIds.includes(Number(chainId))) {
			return true;
		}
	}
	if (chain === "evm") {
		const evmChainIds = Object.values(EvmChainIds);
		if (evmChainIds.includes(Number(chainId))) {
			return true;
		}
	}
	return false;
};
