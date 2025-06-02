import {
	EvmChainIds,
	SolanaNetworkIds,
	type AddressLike,
	type EvmAddressLike,
	type IToken,
	type SolanaAddressLike,
	type TChain,
	type TChainId,
} from "@autofun/types";
import { isAddress as isSolanaAddress } from "@solana/kit";
import { getAddress, isAddress as isEvmAddress, type Address } from "viem";
import logger from "@autofun/logger";
import { Codex } from "@codex-data/sdk";
import { CHAINID_TO_CODEX_NETWORK_ID, WETH_ADDRESSES } from "@autofun/constants";
import dotenv from "dotenv";
import { TokenPairStatisticsType } from "@codex-data/sdk/dist/sdk/generated/graphql";
import DB from "@autofun/database";
import moment from "moment";
import redis from "@autofun/redis";
import { SolanaRpcProvider } from "@autofun/rpc";
import { EVMRpcProvider } from "@autofun/rpc";
import { PublicKey } from "@solana/web3.js";

dotenv.config();

const CODEX_API_KEY = process.env.CODEX_API_KEY;

if (!CODEX_API_KEY) {
	logger.error("Missing CODEX_API_KEY in enviroment variables");
	process.exit(1);
}

export const codex = new Codex(CODEX_API_KEY);

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

export function getChecksummedAddress(address: AddressLike, chain: "evm"): Address;
export function getChecksummedAddress(address: AddressLike, chain: "solana"): SolanaAddressLike;
export function getChecksummedAddress(address: AddressLike, chain: TChain): Address | string {
	if (chain === "evm") {
		return getAddress(address);
	}
	if (chain === "solana") {
		return new PublicKey(address).toBase58();
	}

	throw new Error("Invalid chain or address passed");
}

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
	if (!tokensToPopulate || tokensToPopulate?.length === 0) {
		logger.warn("No tokens provided to populate");
		return [];
	}

	logger.info(`Received ${tokensToPopulate.length} tokens to populate`);

	// Clean up invalid tokens from database
	const invalidTokens = tokensToPopulate.filter((token) => !token?.contractAddress);
	if (invalidTokens.length > 0) {
		logger.warn(`Found ${invalidTokens.length} tokens without contract addresses, removing them from database`);
		const invalidTokenIds = invalidTokens.map((token) => token._id).filter(Boolean);
		if (invalidTokenIds.length > 0) {
			await DB.Token.deleteMany({ _id: { $in: invalidTokenIds } });
			logger.info(`Removed ${invalidTokenIds.length} invalid tokens from database`);
		}
	}

	// Validate tokens have required fields
	const validTokens = tokensToPopulate.filter((token) => {
		if (!token) {
			logger.warn("Found null/undefined token");
			return false;
		}
		if (!token?.contractAddress || !token?.chain || !token?.chainId) {
			logger.warn(`Skipping invalid token: ${JSON.stringify(token)}`);
			return false;
		}
		return true;
	});

	if (validTokens.length === 0) {
		logger.warn("No valid tokens to populate after validation");
		return [];
	}

	logger.info(`Found ${validTokens.length} valid tokens after validation`);

	const ops = [];

	/** All imports tokens can be fetched using Codex */
	const tokenIndex: Record<AddressLike, IToken<TChain>> = {};

	const tokensToQuery = validTokens
		.filter((t) => t?.imported)
		.map((token: IToken) => {
			const { chain, chainId, contractAddress } = token;
			const networkId =
				chain === "evm"
					? CHAINID_TO_CODEX_NETWORK_ID.evm[chainId as EvmChainIds]
					: CHAINID_TO_CODEX_NETWORK_ID.solana[chainId as SolanaNetworkIds];

			tokenIndex[contractAddress] = token;

			return `${contractAddress}:${networkId}`;
		});

	logger.info(`Found ${tokensToQuery.length} imported tokens to query from Codex`);

	const tokenData = await codex.queries.filterTokens({
		statsType: TokenPairStatisticsType.Unfiltered,
		tokens: tokensToQuery,
	});

	const results = tokenData?.filterTokens?.results;

	if (results) {
		logger.info(`Received ${results.length} results from Codex`);
		for (const token of results) {
			const address = token?.token?.address as AddressLike;
			if (!tokenIndex) {
				logger.warn("tokenIndex is undefined");
				continue;
			}

			const key = Object.keys(tokenIndex).find((a) => address.toLowerCase() === a.toLowerCase());
			const tokenRecord = key
				? (tokenIndex[key as AddressLike] as IToken<TChain> & { _id?: string; updatedAt?: Date })
				: undefined;

			if (!tokenRecord) {
				logger.warn(`No matching token record found for address ${address}`);
				continue;
			}

			/** If the record was already updated very recently, there is no need to do it again.
			 * This can occur when the user first navigates to /token, and very shortly after to
			 * a single token page */
			const secondsPassedSinceUpdate = moment().diff(moment(tokenRecord.updatedAt), "seconds");

			if (secondsPassedSinceUpdate <= 10) {
				logger.info(`Skipping token ${address} - updated recently`);
				continue;
			}

			const marketcap = token?.marketCap ? Number(token?.marketCap) : 0;
			tokenRecord.marketcap = marketcap;
			const price = token?.priceUSD ? Number(token?.priceUSD) : 0;
			tokenRecord.price = price;
			const volume24h = token?.volume24 ? Number(token?.volume24) : 0;
			tokenRecord.volume24h = volume24h;
			const holders = token?.holders ? Number(token?.holders) : 0;

			ops.push({
				updateOne: {
					filter: {
						_id: String(tokenRecord._id),
					},
					update: {
						$set: {
							marketcap,
							price,
							volume24h,
							holders,
						},
					},
				},
			});

			/* Remove the _id field so we dont return it anywhere **/
			if (tokenRecord?._id) {
				delete tokenRecord._id;
			}
		}
	}

	/** All non imported tokens should be determined using RPC */
	const nonImportedTokens = validTokens.filter(
		(t) => t?.imported === false && t.chain === "solana" && t.chainId === 101,
	);

	logger.info(`Found ${nonImportedTokens.length} non-imported Solana tokens`);

	if (nonImportedTokens?.length > 0) {
		const rpc = await SolanaRpcProvider.connect(SolanaNetworkIds.Mainnet);
		const bondingCurveInfo = await rpc.getBondingCurveInfo(nonImportedTokens.map((k) => k.contractAddress));

		logger.info(`Received ${bondingCurveInfo.length} bonding curve info results`);

		for (const tokenRecord of bondingCurveInfo) {
			if (!tokenRecord?.contractAddress) {
				logger.warn("Bonding curve info missing contractAddress");
				continue;
			}

			const nonImportedToken = nonImportedTokens.find(
				(a) => a.contractAddress === tokenRecord.contractAddress,
			) as IToken<TChain> & { _id?: string; updatedAt?: Date };

			if (!nonImportedToken) {
				logger.warn(`No matching non-imported token found for ${tokenRecord.contractAddress}`);
				continue;
			}

			tokenIndex[nonImportedToken.contractAddress] = {
				...nonImportedToken,
			};

			/** If the record was already updated very recently, there is no need to do it again.
			 * This can occur when the user first navigates to /token, and very shortly after to
			 * a single token page */
			const secondsPassedSinceUpdate = moment().diff(moment(nonImportedToken.updatedAt), "seconds");

			if (secondsPassedSinceUpdate <= 7) {
				logger.info(`Skipping token ${tokenRecord.contractAddress} - updated recently`);
				continue;
			}

			if (!nonImportedToken?._id) {
				logger.warn(`Token ${tokenRecord.contractAddress} missing _id`);
				continue;
			}

			const setValues: {
				marketcap: number;
				price: number;
				curveCompleted?: boolean;
				curveProgress?: number;
				creator?: AddressLike;
				bondingCurveAddress?: AddressLike;
			} = {
				marketcap: Number(tokenRecord.marketCapUSD),
				price: Number(tokenRecord.priceUsd),
				curveCompleted: Boolean(tokenRecord.curveCompleted),
				curveProgress: Number(tokenRecord.curveProgress),
			};

			if (tokenRecord?.bondingCurveAddress) {
				setValues.bondingCurveAddress = String(tokenRecord?.bondingCurveAddress) as AddressLike;
			}

			if (tokenRecord?.creator) {
				setValues.creator = String(tokenRecord?.creator) as AddressLike;
			}

			ops.push({
				updateOne: {
					filter: {
						_id: String(nonImportedToken?._id),
					},
					update: {
						$set: setValues,
					},
				},
			});

			/* Remove the _id field so we dont return it anywhere **/
			if (nonImportedToken?._id) {
				delete nonImportedToken._id;
			}

			tokenIndex[nonImportedToken.contractAddress] = {
				...nonImportedToken,
				...setValues,
			};
		}
	}

	if (ops?.length > 0) {
		logger.info(`Performing ${ops.length} database updates`);
		await DB.Token.bulkWrite(ops);
	}

	const finalTokens = Object.values(tokenIndex);
	logger.info(`Returning ${finalTokens.length} populated tokens`);
	return finalTokens;
};

export const updateCryptoPrices = async ({ cacheKey = "prices" }: { cacheKey?: string }) => {
	const wrappedSol = "So11111111111111111111111111111111111111112";

	const prices = await codex.queries.getTokenPrices({
		inputs: [
			/** Ethereum */
			{
				address: WETH_ADDRESSES[EvmChainIds.EthereumMainnet],
				networkId: CHAINID_TO_CODEX_NETWORK_ID.evm[EvmChainIds.EthereumMainnet] as number,
			},
			/** Solana */
			{
				address: wrappedSol,
				networkId: CHAINID_TO_CODEX_NETWORK_ID.solana[SolanaNetworkIds.Mainnet] as number,
			},
		],
	});

	const results = prices?.getTokenPrices;
	const solana = results?.find((token) => token?.address.toLowerCase() === wrappedSol.toLowerCase())?.priceUsd;
	const ethereum = results?.find(
		(token) => token?.address.toLowerCase() === WETH_ADDRESSES[EvmChainIds.EthereumMainnet].toLowerCase(),
	)?.priceUsd;

	const resolvedPrices = { solana, ethereum };

	await redis.setex(cacheKey, 45, JSON.stringify(resolvedPrices));

	return resolvedPrices;
};

export async function userHasEnoughTokenBalance({
	chain,
	address,
	contractAddress,
	chainId,
	minAmount,
}: {
	chain: "solana" | "evm";
	address: AddressLike;
	contractAddress: AddressLike;
	chainId: SolanaNetworkIds | EvmChainIds;
	minAmount: number | bigint;
}) {
	const balance = await getTokenBalance({
		chain,
		address,
		contractAddress,
		chainId,
	});

	return Number(balance) >= Number(minAmount);
}

export async function getTokenBalance({
	chain,
	address,
	contractAddress,
	chainId,
}: {
	chain: "solana" | "evm";
	address: AddressLike;
	contractAddress: AddressLike;
	chainId: SolanaNetworkIds | EvmChainIds;
}): Promise<number> {
	if (chain === "evm") {
		return await new EVMRpcProvider(chainId as EvmChainIds).getTokenBalance(
			contractAddress as EvmAddressLike,
			address as EvmAddressLike,
		);
	}

	if (chain === "solana") {
		const rpc = await SolanaRpcProvider.connect(chainId as SolanaNetworkIds);
		return rpc.getTokenBalance(contractAddress, address);
	}

	throw new Error("Unsupported chain");
}

export const getPercentageOfTotal = (value: number, total: number): string | number => {
	if (total === 0) {
		return 0;
	}

	const percentage = (value / total) * 100;
	return percentage?.toFixed(2);
};
