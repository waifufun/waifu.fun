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
import { formatUnits, getAddress, isAddress as isEvmAddress, type Address } from "viem";
import logger from "@autofun/logger";
import { Codex } from "@codex-data/sdk";
import { CHAINID_TO_CODEX_NETWORK_ID, FALLBACK_PRICES, WETH_ADDRESSES } from "@autofun/constants";
import dotenv from "dotenv";
import { TokenPairStatisticsType } from "@codex-data/sdk/dist/sdk/generated/graphql";
import DB from "@autofun/database";
import moment from "moment";
import redis from "@autofun/redis";
import { SolanaRpcProvider } from "@autofun/rpc";
import { EVMRpcProvider } from "@autofun/rpc";
import { PublicKey } from "@solana/web3.js";
import { BigNumber } from "bignumber.js";

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

export const lookUp24hVolume = async (
	contractAddresses: AddressLike[],
): Promise<{ totalVolumeDollars?: number; totalVolume?: number; contractAddress?: AddressLike }[]> => {
	const prices = await updateCryptoPrices({});
	const solanaPrice = prices.solana;

	const tokens = await DB.Event.aggregate([
		{
			$match: {
				contractAddress: { $in: contractAddresses },
				eventType: { $in: ["swap", "launchAndSwap"] },
				createdAt: {
					$gte: moment().subtract(1, "day").toDate(),
					$lte: moment().toDate(),
				},
			},
		},
		{
			$group: {
				_id: "$contractAddress",
				totalVolume: {
					$sum: {
						$toDouble: {
							$cond: [{ $eq: ["$direction", 0] }, "$swapAmount", "$amountGotten"],
						},
					},
				},
			},
		},
		{
			$project: {
				contractAddress: "$_id",
				_id: 0,
				totalVolume: 1,
			},
		},
	]);

	for (const token of tokens) {
		token.totalVolumeDollars = new BigNumber(formatUnits(token.totalVolume, 9))
			.multipliedBy(new BigNumber(solanaPrice))
			.toNumber();
	}

	return tokens;
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
	if (!tokensToPopulate || tokensToPopulate?.length === 0) {
		logger.warn("No tokens provided to populate");
		return [];
	}

	const needsUpdate = (token: IToken) => {
		const secondsPassedSinceUpdate = moment().diff(moment(token.updatedAt), "seconds");
		if (secondsPassedSinceUpdate <= 7) {
			logger.info(`Skipping token ${token.contractAddress} - updated recently`);
			return false;
		}
		return true;
	};

	logger.info(`Received ${tokensToPopulate.length} tokens to populate`);

	const ops: {
		updateOne: {
			filter: {
				_id: string;
			};
			update: {
				$set: Partial<IToken>;
			};
		};
	}[] = [];

	const tokens: Record<"codex" | "indexer", (IToken & { originalIndex?: number })[]> = {
		codex: [],
		indexer: [],
	};

	// logger.info(`Querying tokens: Codex -> ${tokens?.codex?.length || 0} | Indexer -> ${tokens?.indexer?.length || 0}`);

	const originalMapping: AddressLike[] = [];
	for (const token of tokensToPopulate) {
		originalMapping.push(token.contractAddress);
		if (token?.imported || token?.curveCompleted) {
			tokens.codex.push(token);
		} else {
			tokens.indexer.push(token);
		}
	}

	/** Query Codex for imported or tokens that having curveCompleted */
	const tokensToQuery = tokens.codex
		.filter((t) => needsUpdate(t))
		.filter((token: IToken) => {
			const { chain, chainId } = token;
			const networkId =
				chain === "evm"
					? CHAINID_TO_CODEX_NETWORK_ID.evm[chainId as EvmChainIds]
					: CHAINID_TO_CODEX_NETWORK_ID.solana[chainId as SolanaNetworkIds];
			return networkId !== undefined;
		})
		.map((token: IToken) => {
			const { chain, chainId, contractAddress } = token;
			const networkId =
				chain === "evm"
					? CHAINID_TO_CODEX_NETWORK_ID.evm[chainId as EvmChainIds]
					: CHAINID_TO_CODEX_NETWORK_ID.solana[chainId as SolanaNetworkIds];
			return `${contractAddress}:${networkId}`;
		});

	const tokenData = await codex.queries.filterTokens({
		statsType: TokenPairStatisticsType.Unfiltered,
		tokens: tokensToQuery,
	});

	const results = tokenData?.filterTokens?.results;

	if (results) {
		logger.info(`Received ${results.length} results from Codex`);
		for (const token of results) {
			const address = token?.token?.address as AddressLike;
			const tokenRecord = tokens.codex.find((a) => address.toLowerCase() === a.contractAddress.toLowerCase());

			if (!tokenRecord) {
				logger.warn(`No matching token record found for address ${address}`);
				continue;
			}

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
					filter: { _id: String(tokenRecord._id) },
					update: {
						$set: { marketcap, price, volume24h, holders },
					},
				},
			});
		}
	}

	/** Indexer */
	const rpc =
		process.env.NETWORK === "devnet"
			? await SolanaRpcProvider.connect(SolanaNetworkIds.Devnet)
			: await SolanaRpcProvider.connect(SolanaNetworkIds.Mainnet);
	const mustUpdateTokens = tokens.indexer.filter((t) => needsUpdate(t)).map((k) => k.contractAddress);

	// Group tokens by version for bonding curve info retrieval
	const tokensByVersion = new Map<number, string[]>();
	for (const token of tokens.indexer) {
		if (needsUpdate(token)) {
			const version = token.version || 1;
			if (!tokensByVersion.has(version)) {
				tokensByVersion.set(version, []);
			}
			tokensByVersion.get(version)?.push(token.contractAddress);
		}
	}

	// Get bonding curve info for each version group
	const bondingCurveInfoPromises = Array.from(tokensByVersion.entries()).map(([version, addresses]) =>
		rpc.getBondingCurveInfo(addresses, version),
	);
	const bondingCurveInfoResults = await Promise.all(bondingCurveInfoPromises);
	const bondingCurveInfo = bondingCurveInfoResults.flat();

	const volume24hTokens = await lookUp24hVolume(mustUpdateTokens);

	for (const indexedToken of tokens.indexer) {
		const tokenBondingCurveInfo = bondingCurveInfo.find((a) => a.contractAddress === indexedToken.contractAddress);
		if (!tokenBondingCurveInfo) continue;
		const setValues: {
			marketcap: number;
			price: number;
			curveCompleted?: boolean;
			curveProgress?: number;
			creator?: AddressLike;
			bondingCurveAddress?: AddressLike;
			bondingCurveBalance?: number;
			maxBuyAmount?: number;
			tradingStartsAt?: Date;
		} = {
			marketcap: Number(tokenBondingCurveInfo.marketCapUSD),
			price: Number(tokenBondingCurveInfo.priceUsd),
			curveCompleted: Boolean(tokenBondingCurveInfo.curveCompleted),
			curveProgress: Number(tokenBondingCurveInfo.curveProgress),
		};

		indexedToken.marketcap = Number(tokenBondingCurveInfo.marketCapUSD);
		indexedToken.price = Number(tokenBondingCurveInfo.priceUsd);
		indexedToken.curveCompleted = Boolean(tokenBondingCurveInfo.curveCompleted);
		indexedToken.curveProgress = Number(tokenBondingCurveInfo.curveProgress);

		const volume24h = volume24hTokens?.find((a) => a?.contractAddress === indexedToken.contractAddress);

		if (volume24h?.totalVolumeDollars) {
			indexedToken.volume24h = volume24h.totalVolumeDollars;
		}

		if (tokenBondingCurveInfo?.bondingCurveAddress) {
			const bondingCurveAddress = String(tokenBondingCurveInfo?.bondingCurveAddress) as AddressLike;
			indexedToken.bondingCurveAddress = bondingCurveAddress;
			setValues.bondingCurveAddress = bondingCurveAddress;
		}

		if (tokenBondingCurveInfo?.bondingCurveBalance) {
			const bondingCurveBalanceB = Number(tokenBondingCurveInfo?.bondingCurveBalance);
			indexedToken.bondingCurveBalance = bondingCurveBalanceB;
			setValues.bondingCurveBalance = bondingCurveBalanceB;
		}

		if (tokenBondingCurveInfo?.creator) {
			const creator = String(tokenBondingCurveInfo?.creator) as AddressLike;
			indexedToken.creator = creator;
			setValues.creator = creator;
		}

		if (tokenBondingCurveInfo?.delayForTrade && tokenBondingCurveInfo?.createdTime) {
			const delayForTrade = tokenBondingCurveInfo?.delayForTrade;
			const createdTime = tokenBondingCurveInfo?.createdTime;
			const tradingStartsAt = moment(Number(createdTime) * 1000)
				.add(Number(delayForTrade) * 1000, "milliseconds")
				.toDate();
			indexedToken.tradingStartsAt = tradingStartsAt;
			setValues.tradingStartsAt = tradingStartsAt;
		}

		if (tokenBondingCurveInfo?.maxAmount) {
			const maxAmount = tokenBondingCurveInfo?.maxAmount;
			indexedToken.maxBuyAmount = maxAmount;
			setValues.maxBuyAmount = maxAmount;
		}

		ops.push({
			updateOne: {
				filter: { _id: String(indexedToken?._id) },
				update: { $set: setValues },
			},
		});
	}

	if (ops?.length > 0) {
		logger.info(`Performing ${ops.length} database updates`);
		await DB.Token.bulkWrite(ops);
	}

	/** Return the tokens in the original way they came in to respect sorting and other things */
	const allTokens = [...tokens.codex, ...tokens.indexer];
	const returnTokens = [];
	for (const token of allTokens) {
		const index = originalMapping.indexOf(token.contractAddress);
		returnTokens[index] = token;
	}
	return returnTokens;
};

export const updateCryptoPrices = async ({
	cacheKey = "prices",
}: { cacheKey?: string }): Promise<{ solana: number; ethereum: number }> => {
	try {
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

		if (!solana) {
			throw new Error("Failed to determine Solana price, using fallback...");
		}

		if (!ethereum) {
			throw new Error("Failed to determine Ethereum price, using fallback...");
		}

		const resolvedPrices = { solana, ethereum };

		if (!resolvedPrices?.solana || !resolvedPrices?.ethereum) {
			throw new Error("Missing Solana or Ethereum price...");
		}

		await redis.setex(cacheKey, 2 * 60, JSON.stringify(resolvedPrices));

		return resolvedPrices;
	} catch (e) {
		logger.error(e);
		return FALLBACK_PRICES;
	}
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

export function groupEventsIntoOHLC(
	priceData: Array<{
		timestamp: number;
		price: number;
		volume: number;
		volumeUSD: number;
	}>,
	timeframeMs: number,
	limit: number,
): Array<{
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	volumeUSD: number;
}> {
	if (priceData.length === 0) return [];

	priceData.sort((a, b) => a.timestamp - b.timestamp);

	const candles = new Map<
		number,
		{
			timestamp: number;
			open: number;
			high: number;
			low: number;
			close: number;
			volume: number;
			volumeUSD: number;
			trades: Array<{ price: number; volume: number; volumeUSD: number; timestamp: number }>;
		}
	>();

	for (const trade of priceData) {
		const bucketTime = Math.floor(trade.timestamp / timeframeMs) * timeframeMs;

		if (!candles.has(bucketTime)) {
			candles.set(bucketTime, {
				timestamp: bucketTime,
				open: trade.price,
				high: trade.price,
				low: trade.price,
				close: trade.price,
				volume: 0,
				volumeUSD: 0,
				trades: [],
			});
		}

		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		const candle = candles.get(bucketTime)!;
		candle.trades.push({
			price: trade.price,
			volume: trade.volume,
			volumeUSD: trade.volumeUSD,
			timestamp: trade.timestamp,
		});
	}

	const result: Array<{
		timestamp: number;
		open: number;
		high: number;
		low: number;
		close: number;
		volume: number;
		volumeUSD: number;
	}> = [];

	for (const [bucketTime, candle] of candles) {
		if (candle.trades.length === 0) continue;

		candle.trades.sort((a, b) => a.timestamp - b.timestamp);

		const firstTrade = candle.trades[0];
		const lastTrade = candle.trades[candle.trades.length - 1];

		if (!firstTrade || !lastTrade) continue;

		const open = firstTrade.price;
		const close = lastTrade.price;
		const high = Math.max(...candle.trades.map((t) => t.price));
		const low = Math.min(...candle.trades.map((t) => t.price));
		const volume = candle.trades.reduce((sum, t) => sum + t.volume, 0);
		const volumeUSD = candle.trades.reduce((sum, t) => sum + t.volumeUSD, 0);

		result.push({
			timestamp: bucketTime,
			open,
			high,
			low,
			close,
			volume,
			volumeUSD,
		});
	}

	result.sort((a, b) => b.timestamp - a.timestamp);
	return result.slice(0, limit);
}
