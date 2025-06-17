import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import type {
	IHolder,
	AddressLike,
	IToken,
	SolanaAddressLike,
	SolanaNetworkIds,
	TChain,
	TChainId,
	TURLLike,
	ITrade,
} from "@autofun/types";
import {
	getChecksummedAddress,
	getPercentageOfTotal,
	groupEventsIntoOHLC,
	isChainIdAllowedForChain,
	isSupportedAddress,
	populateTokensWithLiveData,
	updateCryptoPrices,
} from "@autofun/utils";
import { EVMRpcProvider, SolanaRpcProvider } from "@autofun/rpc";
import { uploadImageFromUrl, upload, uploadBase64Image } from "@autofun/s3-uploader";
import { CHAINID_TO_CODEX_NETWORK_ID, CHAINID_TO_DEXSCREENER_NAME, CHAINID_TO_SYMBOL } from "@autofun/constants";
import redis from "@autofun/redis";
import type { MongooseBaseQueryOptions, PaginateOptions } from "mongoose";
import { codex } from "@autofun/utils";
import { HoldersSortAttribute, RankingDirection, EventType } from "@codex-data/sdk/dist/sdk/generated/graphql";
import { getBondingCurveData } from "../utils/bonding-curve";
import logger from "@autofun/logger";

export default async function tokenRoutes(fastify: FastifyInstance) {
	/** Retrieve multiple tokens */
	fastify.post<{
		Reply: { tokens: IToken[] };
	}>("/", async (request) => {
		try {
			logger.info("Received tokens request with body:", JSON.stringify(request.body));
			const queryParams = request.body as {
				chain: TChain;
				chainId: TChainId;
				page: number;
				limit?: number;
				search?: string;
				category: "new" | "trending" | "featured" | "marketcap" | "about-to-bond";
			};

			const limit = queryParams?.limit;
			const page = queryParams?.page || 1;
			const isSearch = !!queryParams?.search;

			const category = queryParams.category || "new";
			let sortQuery = undefined;

			switch (category) {
				case "new":
					sortQuery = "-createdAt";
					break;
				case "about-to-bond":
					sortQuery = "-curveProgress";
					break;
				case "trending":
					sortQuery = "-volume24h -marketcap";
					break;
				case "featured":
					sortQuery = "-featured";
					break;
				case "marketcap":
					sortQuery = "-marketcap";
					break;
			}

			let chain = null;
			let chainId = null;
			if (queryParams?.chain && queryParams?.chainId) {
				chain = queryParams?.chain;
				chainId = queryParams?.chainId;
				const allowedChain = isChainIdAllowedForChain(chain, chainId);
				if (!allowedChain) throw new Error("Unsupported chain pair");
			}

			const cacheKey = `${chain}:${chainId}:${page}:${category}:${sortQuery}:${limit}:tokens:${isSearch ? queryParams?.search : "non-search"}`;
			logger.info(`Cache key: ${cacheKey}`);

			const cache = await redis.get(cacheKey);

			if (cache) {
				logger.info("Returning cached tokens data");
				return JSON.parse(cache);
			}

			const query: MongooseBaseQueryOptions = {
				hidden: { $ne: true },
			};

			if (queryParams?.search) {
				query.$text = { $search: queryParams.search };
			}

			if (chain && chainId) {
				query.chain = chain;
				query.chainId = chainId;
			}

			const paginationOptions: PaginateOptions = {
				page,
				lean: true,
				limit: limit ? (limit > 50 ? 50 : limit) : 50,
				select: "-__v",
				leanWithId: false,
				sort: sortQuery,
			};

			const tokensPaginated = await DB.Token.paginate(query, paginationOptions);
			const populatedTokens = await populateTokensWithLiveData(tokensPaginated.docs);

			const returnData = {
				...tokensPaginated,
				docs: populatedTokens,
			};

			await redis.setex(cacheKey, 10, JSON.stringify(returnData));

			return returnData;
		} catch (error) {
			logger.error({ err: error }, "Error in tokens route");
			throw error;
		}
	});

	/** Retrieve a single token */
	fastify.get<{
		Params: {
			chain: TChain;
			chainId: TChainId;
			contractAddress: AddressLike;
		};
		Reply: IToken | null;
	}>("/:chain/:chainId/:contractAddress", async (request) => {
		const { contractAddress, chain, chainId } = request.params;

		const isAllowed = isSupportedAddress(contractAddress);
		if (!isAllowed) throw new Error("Unsupported address");
		const isAllowedChainPair = isChainIdAllowedForChain(chain, chainId);
		if (!isAllowedChainPair) throw new Error("Unsupported chain/chainId value");

		const checksummedQueryAddress =
			chain === "evm" ? getChecksummedAddress(contractAddress, chain) : getChecksummedAddress(contractAddress, chain);

		const cacheKey = `${chain}:${chainId}:${checksummedQueryAddress}`;

		const cache = await redis.get(cacheKey);

		if (cache) {
			// return JSON.parse(cache);
		}

		const token = await DB.Token.findOne({
			contractAddress: checksummedQueryAddress,
			chainId,
			chain,
			hidden: { $ne: true },
		}).lean();

		if (!token) throw new Error("Token was not found");

		const populatedToken = await populateTokensWithLiveData([token]);

		await redis.setex(cacheKey, 8, JSON.stringify(populatedToken[0]));

		return token;
	});

	fastify.post<{
		Body: {
			contractAddress: AddressLike;
			chain: TChain;
			chainId: TChainId;
			pool: string;
			signature: string;
			twitter?: string;
			telegram?: string;
			website?: string;
			discord?: string;
			imported?: boolean;
		};
		Reply: { success: boolean; token?: IToken; error?: string };
	}>("/create", async (request, reply) => {
		try {
			const user = request.authUser;
			if (!user?.solana && process.env.NODE_ENV !== "development") {
				return reply.code(401).send({ success: false, error: "Authentication required" });
			}

			const { contractAddress, chain, chainId, twitter, telegram, website, discord, imported, pool, signature } =
				request.body;

			// Only support Solana for now
			if (chain !== "solana") {
				return reply.code(400).send({ success: false, error: "Only Solana tokens are supported" });
			}

			const userDoc = await DB.User.findOne({ address: user?.solana });
			if (userDoc?.suspended) {
				return reply.code(403).send({ success: false, error: "This account is suspended" });
			}
			const existingToken = await DB.Token.findOne({
				contractAddress,
				chain,
				chainId,
			});

			if (existingToken) {
				return reply.code(409).send({
					success: false,
					error: "Token already exists",
					token: existingToken,
				});
			}

			const rpc = new SolanaRpcProvider(chainId as unknown as SolanaNetworkIds);
			const metadata = await rpc.getTokenMetadata(contractAddress);
			if (!metadata) {
				return reply.code(404).send({ success: false, error: "Token not found on chain" });
			}

			// biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
			let bondingCurveData;
			try {
				bondingCurveData = await getBondingCurveData(
					contractAddress,
					chainId as unknown as SolanaNetworkIds,
					metadata.totalSupply || 0,
					metadata.decimals || 9,
				);
			} catch (error) {
				console.error("Error getting bonding curve data:", error);
				// Continue without bonding curve data
				// should we just return an error? {/* Malibu */}
				bondingCurveData = {
					reserveAmount: 0,
					reserveLamport: 0,
					virtualReserves: 0,
					liquidity: 0,
					currentPrice: 0,
					marketCapUSD: 0,
					tokenPriceUSD: 0,
					curveProgress: 0,
					curveLimit: 0,
				};
			}

			// Create new token
			const newToken = await DB.Token.create({
				contractAddress,
				chain,
				chainId,
				name: metadata.name || `Token ${contractAddress.slice(0, 8)}`,
				ticker: metadata.symbol || "TOKEN",
				image: metadata.image || "",
				description: metadata.description || "",
				decimals: metadata.decimals || 9,
				totalSupply: metadata.totalSupply || 0,
				tokenDecimals: metadata.decimals || 9,
				socials: {
					twitter,
					telegram,
					website,
					discord,
				},
				creator: user?.solana || "unknown",
				hidden: false,
				featured: false,
				imported: imported || false,
				verified: false,
				price: bondingCurveData.tokenPriceUSD,
				marketcap: bondingCurveData.marketCapUSD,
				volume24h: 0,
				holders: 0,
				reserveAmount: bondingCurveData.reserveAmount,
				reserveLamport: bondingCurveData.reserveLamport,
				virtualReserves: bondingCurveData.virtualReserves,
				liquidity: bondingCurveData.liquidity,
				curveProgress: bondingCurveData.curveProgress,
				curveLimit: bondingCurveData.curveLimit,
				pool,
			});

			return {
				success: true,
				token: newToken,
			};
		} catch (error) {
			console.error("Error in create token endpoint:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error creating token",
			});
		}
	});

	fastify.post("/trades", async (request) => {
		const { contractAddress, chain, chainId } = request.body as {
			contractAddress: AddressLike;
			chain: TChain;
			chainId: TChainId;
		};

		const allowedChain = isChainIdAllowedForChain(chain, chainId);
		if (!allowedChain) throw new Error("Unsupported chain pair");
		const isAllowedChainPair = isChainIdAllowedForChain(chain, chainId);
		if (!isAllowedChainPair) throw new Error("Unsupported chain/chainId value");

		const checksummedQueryAddress =
			chain === "evm" ? getChecksummedAddress(contractAddress, chain) : getChecksummedAddress(contractAddress, chain);

		const cacheKey = `${chain}:${chainId}:${checksummedQueryAddress}:trades`;

		const cache = await redis.get(cacheKey);

		if (cache) {
			return JSON.parse(cache);
		}

		const token = await DB.Token.findOne({
			chain,
			chainId,
			contractAddress: checksummedQueryAddress,
		})
			.select("decimals creator totalSupply imported curveCompleted")
			.lean();

		if (!token) {
			throw new Error(`Token: ${contractAddress} could not be found`);
		}

		// Check if the token exists in the event collection
		const eventsExist = await DB.Event.findOne({
			contractAddress: checksummedQueryAddress,
			eventType: { $in: ["swap", "launchAndSwap"] },
		}).lean();

		// If token exists in events but curve is not completed, get swaps from our DB
		if (eventsExist && !token.curveCompleted) {
			const swapEvents = await DB.Event.find({
				contractAddress: checksummedQueryAddress,
				eventType: { $in: ["swap", "launchAndSwap"] },
				processed: true,
			})
				.sort({ slot: -1 })
				.limit(50)
				.lean();

			const nativePricesResult = await redis.get("prices");
			let nativePrices: Record<string, number> | null = nativePricesResult ? JSON.parse(nativePricesResult) : null;
			if (!nativePrices) {
				const cryptoPrices = await updateCryptoPrices({ cacheKey: "prices" });
				nativePrices = {
					solana: cryptoPrices.solana ?? 0,
					ethereum: cryptoPrices.ethereum ?? 0,
				};
			}

			// @ts-ignore
			const priceKey = chain === "solana" ? "solana" : "ethereum";
			const nativePrice = nativePrices?.[priceKey] || 0;

			const items: ITrade[] = swapEvents.map((event) => {
				const isBuy = event.direction === 0 || event.eventType === "launchAndSwap";

				let solAmount: string;
				let tokenAmount: string;
				let usdValue = 0;

				if (isBuy) {
					// Buy: NATIVE -> Tokens
					solAmount = event.swapAmount ? (Number(event.swapAmount) / 10 ** 9).toString() : "0"; // SOL spent
					tokenAmount = event.amountGotten
						? (Number(event.amountGotten) / 10 ** (token.decimals || 9)).toString()
						: "0"; // Tokens received
					usdValue = Number(solAmount) * nativePrice || 0;
				} else {
					// Sell: Tokens -> NATIVE
					solAmount = event.amountGotten ? (Number(event.amountGotten) / 10 ** 9).toString() : "0"; // SOL received
					tokenAmount = event.swapAmount ? (Number(event.swapAmount) / 10 ** (token.decimals || 9)).toString() : "0"; // Tokens sold
					usdValue = Number(solAmount) * nativePrice || 0;
				}

				return {
					address: event.user || event.creator || "N/A",
					fromAmount: solAmount,
					// @ts-ignore
					fromToken: CHAINID_TO_SYMBOL[chain][chainId],
					toAmount: tokenAmount,
					toToken: token.ticker || "TOKEN",
					txId: event.signature,
					timestamp: event.blockTime ? event.blockTime * 1000 : new Date(),
					usdValue: usdValue,
					type: isBuy ? "buy" : "sell",
				} as ITrade;
			});

			await redis.setex(cacheKey, 7, JSON.stringify(items));
			return items;
		}

		// For imported tokens or completed curves, use external Codex API
		if (token.curveCompleted) {
			const trades = await codex.queries.getTokenEvents({
				query: {
					address: contractAddress as unknown as string,
					// @ts-ignore
					networkId: CHAINID_TO_CODEX_NETWORK_ID[chain][chainId],
					eventType: EventType.Swap,
					priceUsdTotal: {
						gte: 5,
					},
				},
				direction: RankingDirection.Desc,
				limit: 50,
			});

			const items = Array.from(
				new Map((trades?.getTokenEvents?.items || []).map((item) => [item?.transactionHash, item])).values(),
			).map((event) => {
				const trade = event as {
					maker: string;
					transactionHash: string;
					timestamp: number;
					eventDisplayType: string;
					data: {
						priceUsdTotal: string;
						priceBaseTokenTotal: string;
						amountNonLiquidityToken: string;
					};
				};

				return {
					address: trade?.maker || "N/A",
					fromAmount: trade?.data?.priceBaseTokenTotal,
					// @ts-ignore
					fromToken: CHAINID_TO_SYMBOL[chain][chainId],
					toAmount: trade?.data?.amountNonLiquidityToken || "0",
					txId: trade?.transactionHash,
					timestamp: trade?.timestamp ? trade?.timestamp * 1000 : new Date(),
					usdValue: trade?.data?.priceUsdTotal || null,
					type: trade?.eventDisplayType?.toLowerCase() || "buy",
				} as ITrade;
			});

			await redis.setex(cacheKey, 7, JSON.stringify(items));
			return items;
		}

		return [];
	});

	fastify.post("/holders", async (request) => {
		const { contractAddress, chain, chainId } = request.body as {
			contractAddress: AddressLike;
			chain: "solana" | "evm";
			chainId: TChainId;
		};

		const allowedChain = isChainIdAllowedForChain(chain, chainId);
		if (!allowedChain) throw new Error("Unsupported chain pair");
		const isAllowedChainPair = isChainIdAllowedForChain(chain, chainId);
		if (!isAllowedChainPair) throw new Error("Unsupported chain/chainId value");

		const checksummedQueryAddress =
			chain === "evm" ? getChecksummedAddress(contractAddress, chain) : getChecksummedAddress(contractAddress, chain);

		const cacheKey = `${chain}:${chainId}:${checksummedQueryAddress}:holders`;

		const cache = await redis.get(cacheKey);

		if (cache) {
			return JSON.parse(cache);
		}

		const token = await DB.Token.findOne({
			chain,
			chainId,
			contractAddress: checksummedQueryAddress,
		}).select("decimals creator totalSupply holders");

		if (!token) {
			throw new Error(`Token: ${contractAddress} could not be found`);
		}

		const holders = await codex.queries.holders({
			input: {
				// @ts-ignore - TODO Fix type error
				tokenId: `${contractAddress}:${CHAINID_TO_CODEX_NETWORK_ID[chain][chainId]}`,
				sort: {
					attribute: HoldersSortAttribute.Balance,
					direction: RankingDirection.Desc,
				},
			},
		});

		/** If the holder count differs, we should update it */
		if (Number(token?.holders || 0) !== Number(holders?.holders?.count)) {
			token.holders = Number(holders?.holders?.count);
			await token.save();
		}

		const items: IHolder[] = holders?.holders?.items
			?.splice(0, 50)
			?.filter((item) => Number(item.balance) > 1)
			?.map((item) => {
				const percentage = getPercentageOfTotal(Number(item?.balance ? item?.balance : "0"), Number(token.totalSupply));
				return {
					address: item.address,
					balance: item.balance,
					balanceFormatted: item.shiftedBalance,
					// TODO - Add bonding curve
					isBondingCurve: false,
					isCreator: token?.creator === item.address,
					percentage,
				} as IHolder;
			});

		await redis.setex(cacheKey, 15, JSON.stringify(items));

		return items;
	});

	fastify.post("/balances", async (request) => {
		const { address } = request.body as {
			address: AddressLike;
		};

		const cacheKey = `${address}:balance`;

		const cache = await redis.get(cacheKey);

		if (cache) {
			return JSON.parse(cache);
		}

		const balancesLookup = await codex.queries.balances({
			input: {
				walletAddress: address,
			},
		});
		
		const balances = balancesLookup?.balances?.items;
		
		const tokensLookUp = await codex.queries.tokens({
			ids: balances?.map((token) => {
				return {
					address: token.tokenAddress,
					networkId: token.networkId,
				};
			}),
		});
		
		const user = await DB.User.findOne({ address });

		// populating only the tokens that are in our DB
		const tokensLookUpContractAddresses = tokensLookUp?.tokens?.map((token) =>
			getChecksummedAddress(token?.address as AddressLike, "solana"),
		);
		const tokensFromDatabase = await DB.Token.find({
			contractAddress: { $in: tokensLookUpContractAddresses },
		});

		if (!tokensFromDatabase.length) {
			logger.warn("No populateble tokens found");
		}

		const populatedTokenData = await populateTokensWithLiveData([...tokensFromDatabase]);

		const tokens = tokensLookUp?.tokens;

		const returnData = [];

		for (const balance of balances) {
			const token = tokens?.find(
				(t) =>
					getChecksummedAddress(t?.address as AddressLike, "solana") ===
					getChecksummedAddress(balance.tokenAddress as AddressLike, "solana"),
			);
			const populated = populatedTokenData?.find((p) => p?.contractAddress === balance.tokenAddress);
			const limitedPopulatedData = populated
				? { marketcap: populated.marketcap, price: populated.price, totalSupply: populated.totalSupply }
				: {};
			returnData.push({
				...balance,
				...token,
				...limitedPopulatedData,
			});
		}

		await redis.setex(cacheKey, 60, JSON.stringify({ user, balances: returnData }));

		return { user, balances: returnData };
	});

	/** Import an existing token */
	fastify.post<{
		Body: {
			contractAddress: AddressLike;
			chain: TChain;
			chainId: TChainId;
		};
	}>("/import", async (request) => {
		const { contractAddress, chain, chainId } = request.body;
		const isAllowed = isSupportedAddress(contractAddress);
		if (!isAllowed) throw new Error("Unsupported address");
		const isAllowedChainPair = isChainIdAllowedForChain(chain, chainId);
		if (!isAllowedChainPair) throw new Error("Unsupported chain/chainId value");

		const checksummedQueryAddress =
			chain === "evm" ? getChecksummedAddress(contractAddress, chain) : getChecksummedAddress(contractAddress, chain);

		const exists = await DB.Token.findOne({
			contractAddress: checksummedQueryAddress,
			chain,
			chainId,
		})
			.select("_id")
			.lean();

		if (exists) throw new Error("Token already exists");

		if (chain === "evm") {
			const dexscreenerChainName = CHAINID_TO_DEXSCREENER_NAME[chain][chainId];
			if (!dexscreenerChainName) throw new Error("This token cannot be imported at this time");

			const rpc = new EVMRpcProvider(chainId);

			const [name, ticker, decimals, totalSupply] = await rpc.readErc20Multicall(
				getChecksummedAddress(contractAddress, "evm"),
				["name", "symbol", "decimals", "totalSupply"],
				[],
			);

			if (!totalSupply || BigInt(totalSupply) <= 0n) throw new Error("Total supply of token is 0");
			if (!name) throw new Error("Token has no name");
			if (!ticker) throw new Error("Token has no ticker");
			if (!decimals) throw new Error("Token has no decimals");

			/** Let's try to fetch some additional information from Dexscreener */
			const dexScreenerCall = (await fetch(
				`https://api.dexscreener.com/tokens/v1/${dexscreenerChainName}/${contractAddress}`,
			).then(async (resp) => await resp.json())) as {
				marketCap: number;
				pairCreatedAt: Date;
				priceUsd: number;
				volume: { h24: number };
				info: { socials: { type: string; url: string }[]; websites: { label: string; url: string }[] };
			}[];

			const dexscreenerData = dexScreenerCall?.[0];

			if (!dexscreenerData) throw new Error("Token information could not be determined");

			const image = await uploadImageFromUrl(
				`https://dd.dexscreener.com/ds-data/tokens/${dexscreenerChainName}/${contractAddress.toLowerCase()}.png?size=xl`,
				`${chain}:${chainId}:${contractAddress}`,
				"token-images",
			);

			const marketcap = dexscreenerData?.marketCap ? Number(dexscreenerData?.marketCap) : 0;
			const createdAt = dexscreenerData?.pairCreatedAt ? new Date(dexscreenerData?.pairCreatedAt) : new Date();
			const price = dexscreenerData?.priceUsd ? Number(dexscreenerData?.priceUsd) : 0;
			const volume24h = dexscreenerData?.volume?.h24 ? Number(dexscreenerData?.volume?.h24) : 0;

			const dexscreenerSocials = dexscreenerData?.info?.socials || [];
			const dexscreenerWebsites = dexscreenerData?.info?.websites || [];
			const tokenData: IToken<"evm"> = {
				status: "active",
				chain: "evm",
				chainId,
				contractAddress: getChecksummedAddress(contractAddress, "evm"),
				ticker: String(name),
				name: String(name),
				imported: true,
				image,
				holders: 0,
				price,
				marketcap,
				volume24h,
				socials: {
					discord: (dexscreenerSocials?.find((social) => social.type === "discord")?.url as TURLLike) || undefined,
					telegram: (dexscreenerSocials?.find((social) => social.type === "telegram")?.url as TURLLike) || undefined,
					twitter: (dexscreenerSocials?.find((social) => social.type === "twitter")?.url as TURLLike) || undefined,
					website: (dexscreenerWebsites?.find((website) => website?.label === "Website")?.url as TURLLike) || undefined,
				},
				hidden: false,
				decimals: Number(decimals),
				totalSupply: Number(totalSupply),
				createdAt: createdAt.toISOString(),
				updatedAt: createdAt,
			};

			await DB.Token.create([{ ...tokenData, ...(await populateTokensWithLiveData([tokenData])) }]);
		} else if (chain === "solana") {
			const solanaChainId = chainId as unknown as SolanaNetworkIds;
			const rpc = await SolanaRpcProvider.connect(solanaChainId);

			const metadata = await rpc.getTokenMetadata(contractAddress);

			if (!metadata?.image) throw new Error("Token has no image");

			const image = await uploadImageFromUrl(metadata?.image, `${chain}:${chainId}:${contractAddress}`, "token-images");

			const tokenData: IToken<"solana"> = {
				status: "active",
				chain: "solana",
				chainId: solanaChainId,
				contractAddress: getChecksummedAddress(contractAddress, "solana"),
				ticker: String(metadata?.symbol),
				name: String(metadata?.name),
				imported: true,
				image,
				price: 0,
				holders: 0,
				marketcap: 0,
				volume24h: 0,
				socials: {
					twitter: (metadata?.twitter as TURLLike) || undefined,
					website: (metadata?.website as TURLLike) || undefined,
					discord: (metadata?.discord as TURLLike) || undefined,
					telegram: (metadata?.telegram as TURLLike) || undefined,
				},
				hidden: false,
				creator: (metadata?.creator as SolanaAddressLike) || undefined,
				decimals: Number(metadata?.decimals),
				totalSupply: Number(metadata?.totalSupply),
				createdAt: new Date().toISOString(),
				updatedAt: new Date(),
			};

			await DB.Token.create([{ ...tokenData, ...(await populateTokensWithLiveData([tokenData])) }]);
		}

		return true;
	});

	fastify.post<{
		Body: {
			imageUrl?: string;
			image?: string;
			metadata: {
				name: string;
				symbol: string;
				description?: string;
				twitter?: string;
				telegram?: string;
				website?: string;
				discord?: string;
			};
			manual?: boolean;
		};
		Reply: { success: boolean; imageUrl?: string; metadataUrl?: string; error?: string };
	}>("/create-metadata", async (request, reply) => {
		try {
			const { imageUrl, metadata, image, manual } = request.body;
			const isManual = manual === true;

			if (!imageUrl && !image) {
				return reply.code(400).send({ success: false, error: "Image URL or image is required" });
			}
			if (!metadata?.name || !metadata?.symbol) {
				return reply.code(400).send({ success: false, error: "Metadata (name, symbol) is required" });
			}

			const sanitizedSymbol = metadata.symbol.toLowerCase().replace(/[^a-z0-9]/g, "_");
			const timestamp = Date.now();
			const imageFilename = `${sanitizedSymbol}_${timestamp}`;
			const metadataFilename = `${sanitizedSymbol}_${timestamp}_metadata`;
			let uploadedImageUrl: string | undefined;

			if (isManual) {
				if (image) {
					const base64Result = await uploadBase64Image(image, imageFilename, "token-images");
					uploadedImageUrl = typeof base64Result === "string" ? base64Result : undefined;
				} else {
					return reply.code(400).send({ success: false, error: "Image is required for manual mode" });
				}
			} else {
				if (imageUrl) {
					const isValidUrl = imageUrl.startsWith("http://") || imageUrl.startsWith("https://");
					if (!isValidUrl) {
						return reply.code(400).send({ success: false, error: "Invalid image URL" });
					}
					uploadedImageUrl = await uploadImageFromUrl(imageUrl, imageFilename, "token-images");
				} else {
					return reply.code(400).send({ success: false, error: "Image URL is required for auto mode" });
				}
			}

			if (!uploadedImageUrl) {
				return reply.code(400).send({ success: false, error: "Failed to upload image" });
			}

			const finalMetadata = {
				name: metadata.name,
				symbol: metadata.symbol,
				description: metadata.description || "",
				image: uploadedImageUrl,
				twitter: metadata.twitter || "",
				telegram: metadata.telegram || "",
				website: metadata.website || "",
				discord: metadata.discord || "",
				createdOn: "https://auto.fun/",
			};

			const metadataBuffer = Buffer.from(JSON.stringify(finalMetadata, null, 2));
			await upload(
				"token-metadata",
				{
					data: metadataBuffer,
					mimetype: "application/json",
				},
				metadataFilename,
			);

			const metadataUrl = `${process.env.API_URL}/autofun/token-metadata/${metadataFilename}.json`;

			return reply.send({
				success: true,
				imageUrl: uploadedImageUrl,
				metadataUrl,
			});
		} catch (error) {
			console.error("Error in create-metadata endpoint:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error creating metadata",
			});
		}
	});

	fastify.post<{
		Body: {
			chain: TChain;
			chainId: TChainId;
			contractAddress: AddressLike;
		};
		Reply: { curveCompleted: boolean };
	}>("/curve-completed", async (request) => {
		// check if the token exists in the events database
		const { contractAddress, chain, chainId } = request.body;
		const isAllowed = isSupportedAddress(contractAddress);
		if (!isAllowed) throw new Error("Unsupported address");

		const isAllowedChainPair = isChainIdAllowedForChain(chain, chainId);
		if (!isAllowedChainPair) throw new Error("Unsupported chain/chainId value");

		const checksummedQueryAddress =
			chain === "evm" ? getChecksummedAddress(contractAddress, chain) : getChecksummedAddress(contractAddress, chain);

		const token = await DB.Token.findOne({
			contractAddress: checksummedQueryAddress,
			chainId,
			chain,
			hidden: { $ne: true },
		}).lean();

		if (!token) {
			return { curveCompleted: true };
		}

		const eventsExist = await DB.Event.findOne({
			contractAddress: checksummedQueryAddress,
			eventType: { $in: ["swap", "launchAndSwap", "launch"] },
		}).lean();

		if (!eventsExist) {
			return { curveCompleted: true };
		}

		const curveCompleted = await DB.Event.findOne({
			contractAddress: checksummedQueryAddress,
			eventType: "curveCompleted",
		}).lean();

		if (curveCompleted) {
			return { curveCompleted: true };
		}
		return { curveCompleted: false };
	});

	fastify.post<{
		Body: {
			contractAddress: AddressLike;
			chain: TChain;
			chainId: TChainId;
			timeframe?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
			limit?: number;
		};
		Reply: Array<{
			timestamp: number;
			open: number;
			high: number;
			low: number;
			close: number;
			volume: number;
			volumeUSD: number;
		}>;
	}>("/chart-data", async (request) => {
		const { contractAddress, chain, chainId, timeframe = "5m", limit = 100 } = request.body;

		const allowedChain = isChainIdAllowedForChain(chain, chainId);
		if (!allowedChain) throw new Error("Unsupported chain pair");

		const checksummedQueryAddress =
			chain === "evm" ? getChecksummedAddress(contractAddress, chain) : getChecksummedAddress(contractAddress, chain);

		const cacheKey = `${chain}:${chainId}:${checksummedQueryAddress}:chart:${timeframe}:${limit}`;

		const cache = await redis.get(cacheKey);
		if (cache) {
			return JSON.parse(cache);
		}

		const token = await DB.Token.findOne({
			chain,
			chainId,
			contractAddress: checksummedQueryAddress,
		})
			.select("decimals creator totalSupply imported curveCompleted ticker")
			.lean();

		if (!token) {
			throw new Error(`Token: ${contractAddress} could not be found`);
		}

		const eventsExist = await DB.Event.findOne({
			contractAddress: checksummedQueryAddress,
			eventType: { $in: ["swap", "launchAndSwap"] },
			processed: true,
		}).lean();

		if (!eventsExist) {
			return [];
		}

		// Calculate timeframe in milliseconds
		const timeframeMs = {
			"1m": 60 * 1000,
			"5m": 5 * 60 * 1000,
			"15m": 15 * 60 * 1000,
			"1h": 60 * 60 * 1000,
			"4h": 4 * 60 * 60 * 1000,
			"1d": 24 * 60 * 60 * 1000,
		}[timeframe];

		const nativePricesResult = await redis.get("prices");
		let nativePrices: Record<string, number> | null = nativePricesResult ? JSON.parse(nativePricesResult) : null;
		if (!nativePrices) {
			const cryptoPrices = await updateCryptoPrices({ cacheKey: "prices" });
			nativePrices = {
				solana: cryptoPrices.solana ?? 0,
				ethereum: cryptoPrices.ethereum ?? 0,
			};
		}

		const priceKey = chain === "solana" ? "solana" : "ethereum";
		const nativePrice = nativePrices?.[priceKey] || 0;

		if (eventsExist) {
			// const lookbackTime = Date.now() - (7 * 24 * 60 * 60 * 1000 * 4); // 7 days

			const swapEvents = await DB.Event.find({
				contractAddress: checksummedQueryAddress,
				eventType: { $in: ["swap", "launchAndSwap"] },
				processed: true,
				// blockTime: { $gte: Math.floor(lookbackTime / 1000) }, // blockTime is in seconds
			})
				.sort({ blockTime: 1 })
				.limit(1000)
				.lean();

			if (swapEvents.length === 0) {
				return [];
			}

			const priceData: Array<{
				timestamp: number;
				price: number;
				volume: number;
				volumeUSD: number;
			}> = [];

			for (const event of swapEvents) {
				const isBuy = event.direction === 0 || event.eventType === "launchAndSwap";

				let price = 0;
				let volume = 0;
				let volumeUSD = 0;

				if (event.swapAmount && event.amountGotten) {
					const swapAmount = Number(event.swapAmount);
					const amountGotten = Number(event.amountGotten);

					if (isBuy) {
						// Buy: SOL -> Tokens
						const solSpent = swapAmount / 1e9;
						const tokensReceived = amountGotten / 10 ** (token.decimals || 9);

						if (tokensReceived > 0) {
							price = solSpent / tokensReceived;
							volume = tokensReceived;
							volumeUSD = solSpent * nativePrice;

							console.log(
								"spent sol:",
								solSpent,
								"tokens received:",
								tokensReceived,
								"price:",
								price,
								"volume:",
								volume,
								"volumeUSD:",
								volumeUSD,
							);
							console.log("txHash", event.signature);
						}
					} else {
						// Sell: Tokens -> SOL
						const solReceived = amountGotten / 1e9;
						const tokensSold = swapAmount / 10 ** (token.decimals || 9);

						if (tokensSold > 0) {
							price = solReceived / tokensSold;
							volume = tokensSold;
							volumeUSD = solReceived * nativePrice;

							console.log(
								"received sol:",
								solReceived,
								"tokens sold:",
								tokensSold,
								"price:",
								price,
								"volume:",
								volume,
								"volumeUSD:",
								volumeUSD,
							);
							console.log("txHash", event.signature);
						}
					}
				}

				if (price > 0) {
					priceData.push({
						timestamp: event.blockTime * 1000,
						price: price * nativePrice,
						volume,
						volumeUSD,
					});
				}
			}

			if (priceData.length === 0) {
				return [];
			}

			const ohlcData = groupEventsIntoOHLC(priceData, timeframeMs, limit);

			await redis.setex(cacheKey, 30, JSON.stringify(ohlcData));
			return ohlcData;
		}
		return [];
	});
}
