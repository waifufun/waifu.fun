import {
	EvmChainIds,
	SolanaNetworkIds,
	type AddressLike,
	type IToken,
	type TChain,
	type TChainId,
} from "@autofun/types";
import { isAddress as isSolanaAddress } from "@solana/kit";
import { isAddress as isEvmAddress } from "viem";
import logger from "@autofun/logger";
import { Codex } from "@codex-data/sdk";
import { CHAINID_TO_CODEX_NETWORK_ID } from "@autofun/constants";
import dotenv from "dotenv";
import { TokenPairStatisticsType } from "@codex-data/sdk/dist/sdk/generated/graphql";

dotenv.config();

const CODEX_API_KEY = process.env.CODEX_API_KEY;

if (!CODEX_API_KEY) {
	logger.error("Missing CODEX_API_KEY in enviroment variables");
	process.exit(1);
}

const codex = new Codex(CODEX_API_KEY);

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
export const isChainIdAllowedForChain = (chain: TChain, chainId: TChainId) => {
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

/**
 * Enriches token objects with live market data from the Codex API.
 * 
 * This function takes an array of token objects and fetches current market data
 * including price, market capitalization, and 24-hour volume. It maintains the original
 * token properties while adding or updating these market-related fields.
 * 
 * @param tokensToPopulate - Array of token objects to be enriched with live market data
 * @returns Promise resolving to an array of token objects enhanced with market data
 *   (price, marketcap, volume24h)
 * 
 * @remarks
 * The function creates a query for each token using its contract address and network ID,
 * then makes a batch request to the Codex API. For tokens where data is available,
 * the function updates the original token objects with the retrieved market data.
 * 
 * If the Codex API doesn't return data for a particular token, the original token
 * object is returned with market values set to 0.
 */
export const populateTokensWithLiveData = async (tokensToPopulate: IToken[]): Promise<IToken<TChain>[]> => {
	const tokenIndex: Record<AddressLike, IToken<TChain>> = {};
	const tokensToQuery = tokensToPopulate.map(
		({ chain, chainId, contractAddress }: Pick<IToken, "chain" | "chainId" | "contractAddress">, idx: number) => {
			const networkId =
				chain === "evm"
					? CHAINID_TO_CODEX_NETWORK_ID.evm[chainId as EvmChainIds]
					: CHAINID_TO_CODEX_NETWORK_ID.solana[chainId as SolanaNetworkIds];

			if (tokensToPopulate[idx]) {
				tokenIndex[contractAddress] = tokensToPopulate[idx];
			}
			return `${contractAddress}:${networkId}`;
		},
	);

	const tokenData = await codex.queries.filterTokens({
		statsType: TokenPairStatisticsType.Unfiltered,
		tokens: tokensToQuery,
	});

	const results = tokenData?.filterTokens?.results;

	if (results) {
		for (const token of results) {
			const address = token?.token?.address as AddressLike;
			if (!tokenIndex[address]) {
				continue;
			}

			tokenIndex[address].marketcap = token?.marketCap ? Number(token?.marketCap) : 0;
			tokenIndex[address].price = token?.priceUSD ? Number(token?.priceUSD) : 0;
			tokenIndex[address].volume24h = token?.volume24 ? Number(token?.volume24) : 0;
		}
	}

	return Object.values(tokenIndex);
};
