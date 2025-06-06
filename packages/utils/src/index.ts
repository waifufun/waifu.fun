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

const calculateTokenDataFromEvents = async (contractAddress: string): Promise<{
	marketcap: number;
	price: number;
	curveCompleted: boolean;
	curveProgress: number;
	creator?: string;
	bondingCurveAddress?: string | undefined;
  } | null> => {
	try {
		// Check if curve is completed first
		const completeEvent = await DB.Event.findOne({
			contractAddress: contractAddress,
			eventType: "curveCompleted",
			processed: true
		});
	
		// If curve completed, then irrelevant
		if (completeEvent) {
			return {
			marketcap: 0,
			price: 0,
			curveCompleted: true,
			curveProgress: 100,
			creator: completeEvent.creator || "",
			bondingCurveAddress: completeEvent.bondingCurve || undefined
			};
		}
	
		const token = await DB.Token.findOne({
			contractAddress: contractAddress
		}).select("decimals creator totalSupply imported curveCompleted").lean();
	
		if (!token) {
			logger.warn(`Token ${contractAddress} not found in database`);
			return null;
		}
	
		const eventsExist = await DB.Event.findOne({
			contractAddress: contractAddress,
			eventType: { $in: ["swap", "launchAndSwap", "launch"] },
			processed: true
		}).lean();
	
		if (!eventsExist) {
			logger.warn(`No events found for token ${contractAddress}`);
			return null;
		}
	
		const launchEvent = await DB.Event.findOne({
			contractAddress: contractAddress,
			eventType: { $in: ["launch", "launchAndSwap"] },
			processed: true
		}).sort({ slot: 1 }).lean();
	
		if (!launchEvent) {
			logger.warn(`No launch event found for token ${contractAddress}`);
			return null;
		}
	
		// Get latest swap event to determine current price
		const latestSwapEvent = await DB.Event.findOne({
			contractAddress: contractAddress,
			eventType: { $in: ["swap", "launchAndSwap"] },
			processed: true
		}).sort({ slot: -1 }).lean();
	
		if (!latestSwapEvent) {
			logger.warn(`No swap events found for token ${contractAddress}`);
			return null;
		}
	
		let currentPrice = 0;
		const decimals = token.decimals || 9;
		const LAMPORTS_PER_SOL = 1000000000;
	
		if (latestSwapEvent.swapAmount && latestSwapEvent.amountGotten) {
			const swapAmount = Number(latestSwapEvent.swapAmount);
			const amountGotten = Number(latestSwapEvent.amountGotten);
			
			if (latestSwapEvent.direction === 0 || latestSwapEvent.eventType === "launchAndSwap") {
				const solSpent = swapAmount / LAMPORTS_PER_SOL;
				const tokensReceived = amountGotten / (10 ** decimals);
				if (tokensReceived > 0) {
					currentPrice = solSpent / tokensReceived;
				}
			} else {
				const solReceived = amountGotten / LAMPORTS_PER_SOL;
				const tokensSold = swapAmount / (10 ** decimals);
				if (tokensSold > 0) {
					currentPrice = solReceived / tokensSold;
				}
			}
	 	}
  
		const totalSupply = token.totalSupply || 0;
		let curveProgress = 0;

		const nativePricesResult = await redis.get("prices");
		let nativePrices: Record<string, number> | null = nativePricesResult ? JSON.parse(nativePricesResult) : null;
		if (!nativePrices) {
			const cryptoPrices = await updateCryptoPrices({ cacheKey: "prices" });
			nativePrices = {
				solana: cryptoPrices.solana ?? 0,
				ethereum: cryptoPrices.ethereum ?? 0,
			};
		}

		currentPrice = currentPrice * (nativePrices?.solana || 1);
		const marketcap = (currentPrice * totalSupply) / (10 ** decimals);
  
		return {
			marketcap,
			price: currentPrice,
			curveCompleted: false,
			curveProgress,
			creator: launchEvent.creator || token.creator || "",
			bondingCurveAddress: undefined
		};
  
	} catch (error) {
	  logger.error(`Error calculating token data from events for ${contractAddress}:`, error);
	  return null;
	}
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
	const tokenIndex: Record<AddressLike, IToken<TChain>> = {};  
	// Separate tokens by type
	const importedTokens = validTokens.filter((t) => t?.imported);
	const nonImportedTokens = validTokens.filter(
	  (t) => t?.imported === false && t.chain === "solana" && t.chainId === 101,
	);
  
	logger.info(`Found ${importedTokens.length} imported tokens and ${nonImportedTokens.length} non-imported tokens`);
  
	// Check akk tokens for events first
	const allTokens = [...importedTokens, ...nonImportedTokens];
	const tokensWithEvents: typeof allTokens = [];
	const importedTokensWithoutEvents: typeof importedTokens = [];
	const nonImportedTokensWithoutEvents: typeof nonImportedTokens = [];
  
	for (const token of allTokens) {
	  const hasEvents = await DB.Event.exists({
		contractAddress: token.contractAddress,
		processed: true
	  });
  
	  if (hasEvents) {
		tokensWithEvents.push(token);
	  } else {
		// Sort by type
		if (token.imported) {
		  importedTokensWithoutEvents.push(token);
		} else {
		  nonImportedTokensWithoutEvents.push(token);
		}
	  }
	}
  
	logger.info(`Found ${tokensWithEvents.length} tokens with events, ${importedTokensWithoutEvents.length} imported tokens without events, ${nonImportedTokensWithoutEvents.length} non-imported tokens without events`);
  
	if (tokensWithEvents.length > 0) {
	  logger.info(`Processing ${tokensWithEvents.length} tokens with events data`);
  
	  for (const token of tokensWithEvents) {
		const tokenData = await calculateTokenDataFromEvents(token.contractAddress);
		console.log(`Token data for ${token.contractAddress}:`, tokenData);
		
		if (!tokenData) {
		  logger.warn(`Could not calculate data from events for ${token.contractAddress}`);
		  if (token.imported) {
			importedTokensWithoutEvents.push(token);
		  } else {
			nonImportedTokensWithoutEvents.push(token);
		  }
		  continue;
		}
  
		const tokenRecord = token as IToken<TChain> & { _id?: string; updatedAt?: Date };
		
		tokenIndex[token.contractAddress] = { ...token };
  
		const secondsPassedSinceUpdate = moment().diff(moment(tokenRecord.updatedAt), "seconds");
		if (secondsPassedSinceUpdate <= 7) {
		  logger.info(`Skipping token ${token.contractAddress} - updated recently`);
		  continue;
		}
  
		if (!tokenRecord?._id) {
		  logger.warn(`Token ${token.contractAddress} missing _id`);
		  continue;
		}
  
		const setValues = {
		  marketcap: tokenData.marketcap,
		  price: tokenData.price,
		  curveCompleted: tokenData.curveCompleted,
		  curveProgress: tokenData.curveProgress,
		  ...(tokenData.creator && { creator: tokenData.creator as AddressLike }),
		  ...(tokenData.bondingCurveAddress && { bondingCurveAddress: tokenData.bondingCurveAddress as AddressLike })
		};
  
		ops.push({
		  updateOne: {
			filter: { _id: String(tokenRecord._id) },
			update: { $set: setValues },
		  },
		});
  
		if (tokenRecord._id) {
		  delete tokenRecord._id;
		}
  
		tokenIndex[token.contractAddress] = {
		  ...token,
		  ...setValues,
		};
  
		logger.info(`Updated token ${token.contractAddress} from events data (imported: ${token.imported})`);
	  }
	}
  
	// codex for curve completed tokens or not found in events
	if (importedTokensWithoutEvents.length > 0) {
	  logger.info(`Processing ${importedTokensWithoutEvents.length} imported tokens without events via Codex`);
  
	  const tokensToQuery = importedTokensWithoutEvents.map((token: IToken) => {
		const { chain, chainId, contractAddress } = token;
		const networkId =
		  chain === "evm"
			? CHAINID_TO_CODEX_NETWORK_ID.evm[chainId as EvmChainIds]
			: CHAINID_TO_CODEX_NETWORK_ID.solana[chainId as SolanaNetworkIds];
  
		tokenIndex[contractAddress] = token;
		return `${contractAddress}:${networkId}`;
	  });
  
	  logger.info(`Querying ${tokensToQuery.length} imported tokens from Codex`);
  
	  const tokenData = await codex.queries.filterTokens({
		statsType: TokenPairStatisticsType.Unfiltered,
		tokens: tokensToQuery,
	  });
  
	  const results = tokenData?.filterTokens?.results;
  
	  if (results) {
		logger.info(`Received ${results.length} results from Codex`);
		for (const token of results) {
		  const address = token?.token?.address as AddressLike;
		  const key = Object.keys(tokenIndex).find((a) => address.toLowerCase() === a.toLowerCase());
		  const tokenRecord = key
			? (tokenIndex[key as AddressLike] as IToken<TChain> & { _id?: string; updatedAt?: Date })
			: undefined;
  
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
  
		  if (tokenRecord?._id) {
			delete tokenRecord._id;
		  }
		}
	  }
	}

	if (nonImportedTokensWithoutEvents.length > 0) {
	  logger.info(`Falling back to RPC for ${nonImportedTokensWithoutEvents.length} non-imported tokens without events`);
	  
	  const rpc = await SolanaRpcProvider.connect(SolanaNetworkIds.Mainnet);
	  const bondingCurveInfo = await rpc.getBondingCurveInfo(nonImportedTokensWithoutEvents.map((k) => k.contractAddress));
  
	  logger.info(`Received ${bondingCurveInfo.length} bonding curve info results from RPC`);
  
	  for (const tokenRecord of bondingCurveInfo) {
		if (!tokenRecord?.contractAddress) {
		  logger.warn("Bonding curve info missing contractAddress");
		  continue;

		}
  
		const nonImportedToken = nonImportedTokensWithoutEvents.find(
		  (a) => a.contractAddress === tokenRecord.contractAddress,
		) as IToken<TChain> & { _id?: string; updatedAt?: Date };
  
		if (!nonImportedToken) {
		  logger.warn(`No matching non-imported token found for ${tokenRecord.contractAddress}`);
		  continue;
		}
  
		tokenIndex[nonImportedToken.contractAddress] = { ...nonImportedToken };
  
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
			filter: { _id: String(nonImportedToken?._id) },
			update: { $set: setValues },
		  },
		});
  
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

	await redis.setex(cacheKey, 2 * 60, JSON.stringify(resolvedPrices));

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


export function groupEventsIntoOHLC(
	priceData: Array<{
	  timestamp: number;
	  price: number;
	  volume: number;
	  volumeUSD: number;
	}>,
	timeframeMs: number,
	limit: number
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
  
	const candles = new Map<number, {
	  timestamp: number;
	  open: number;
	  high: number;
	  low: number;
	  close: number;
	  volume: number;
	  volumeUSD: number;
	  trades: Array<{ price: number; volume: number; volumeUSD: number; timestamp: number }>;
	}>();
  
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
	  const high = Math.max(...candle.trades.map(t => t.price));
	  const low = Math.min(...candle.trades.map(t => t.price));
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