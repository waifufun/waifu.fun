import type { AddressLike, TChain } from "@autofun/types";
import { isAddress as isSolanaAddress } from "@solana/kit";
import { isAddress as isEvmAddress } from "viem";

/**
 * Determines the blockchain type (flavor) of a given address.
 *
 * @param {AddressLike} address - The address to check
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
