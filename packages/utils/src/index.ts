import {
	EvmChainIds,
	SolanaNetworkIds,
	type AddressLike,
	type EvmAddressLike,
	type IToken,
	type TChain,
	type TChainId,
} from "@autofun/types";
import { isAddress as isSolanaAddress } from "@solana/kit";
import { isAddress as isEvmAddress } from "viem";
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
	if (!tokensToPopulate || tokensToPopulate?.length === 0) return [];
	const ops = [];

	/** All imports tokens can be fetched using Codex */
	const tokenIndex: Record<AddressLike, IToken<TChain>> = {};

	const tokensToQuery = tokensToPopulate
		.filter((t) => t?.imported)
		.map(({ chain, chainId, contractAddress }: Pick<IToken, "chain" | "chainId" | "contractAddress">, idx: number) => {
			const networkId =
				chain === "evm"
					? CHAINID_TO_CODEX_NETWORK_ID.evm[chainId as EvmChainIds]
					: CHAINID_TO_CODEX_NETWORK_ID.solana[chainId as SolanaNetworkIds];

			if (tokensToPopulate[idx]) {
				tokenIndex[contractAddress] = tokensToPopulate[idx];
			}
			return `${contractAddress}:${networkId}`;
		});

	const tokenData = await codex.queries.filterTokens({
		statsType: TokenPairStatisticsType.Unfiltered,
		tokens: tokensToQuery,
	});

	const results = tokenData?.filterTokens?.results;

	if (results) {
		for (const token of results) {
			const address = token?.token?.address as AddressLike;
			if (!tokenIndex) {
				continue;
			}

			const key = Object.keys(tokenIndex).find((a) => address.toLowerCase() === a.toLowerCase());
			const tokenRecord = key
				? (tokenIndex[key as AddressLike] as IToken<TChain> & { _id?: string; updatedAt?: Date })
				: undefined;

			if (!tokenRecord) {
				continue;
			}

			/** If the record was already updated very recently, there is no need to do it again.
			 * This can occur when the user first navigates to /token, and very shortly after to
			 * a single token page */
			const secondsPassedSinceUpdate = moment().diff(moment(tokenRecord.updatedAt), "seconds");

			if (secondsPassedSinceUpdate <= 10) {
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
	const nonImportedTokens = tokensToPopulate.filter(
		(t) => t?.imported === false && t.chain === "solana" && t.chainId === 101,
	);

	if (nonImportedTokens?.length > 0) {
		const rpc = new SolanaRpcProvider(SolanaNetworkIds.Mainnet);
		const bondingCurveInfo = await rpc.getBondingCurveInfo(nonImportedTokens.map((k) => k.contractAddress));

		for (const tokenRecord of bondingCurveInfo) {
			const nonImportedToken = nonImportedTokens.find(
				(a) => a.contractAddress === tokenRecord.contractAddress,
			) as IToken<TChain> & { _id?: string; updatedAt?: Date };

			tokenIndex[nonImportedToken.contractAddress] = {
				...nonImportedToken,
			};

			/** If the record was already updated very recently, there is no need to do it again.
			 * This can occur when the user first navigates to /token, and very shortly after to
			 * a single token page */
			const secondsPassedSinceUpdate = moment().diff(moment(nonImportedToken.updatedAt), "seconds");

			if (secondsPassedSinceUpdate <= 7) {
				continue;
			}

			if (!nonImportedToken?._id) continue;

			const setValues = {
				marketcap: Number(tokenRecord.marketCapUSD),
				// TODO - Add proper USD price
				price: Number(tokenRecord.marketCapUSD),
				curveCompleted: Boolean(tokenRecord.curveCompleted),
				curveProgress: Number(tokenRecord.curveProgress),
			};

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

			tokenIndex[nonImportedToken.contractAddress] = {
				...nonImportedToken,
				...setValues,
			};
		}
	}

	if (ops?.length > 0) {
		await DB.Token.bulkWrite(ops);
	}

	return Object.values(tokenIndex);
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
		return await new SolanaRpcProvider(chainId as SolanaNetworkIds).getTokenBalance(contractAddress, address);
	}

	throw new Error("Unsupported chain");
}
