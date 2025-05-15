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
	getPercentageOfTotal,
	isChainIdAllowedForChain,
	isSupportedAddress,
	populateTokensWithLiveData,
} from "@autofun/utils";
import { EVMRpcProvider, SolanaRpcProvider } from "@autofun/rpc";
import { getAddress } from "viem";
import { uploadImageFromUrl } from "@autofun/s3-uploader";
import { CHAINID_TO_CODEX_NETWORK_ID, CHAINID_TO_DEXSCREENER_NAME } from "@autofun/constants";
import redis from "@autofun/redis";
import type { MongooseBaseQueryOptions, PaginateOptions } from "mongoose";
import { codex } from "@autofun/utils";
import { HoldersSortAttribute, RankingDirection, EventType } from "@codex-data/sdk/dist/sdk/generated/graphql";

export default async function tokenRoutes(fastify: FastifyInstance) {
	/** Retrieve multiple tokens */
	fastify.post<{
		Reply: { tokens: IToken[] };
	}>("/", async (request) => {
		const queryParams = request.body as { chain: TChain; chainId: TChainId; page: number };
		const page = queryParams?.page || 1;

		let chain = null;
		let chainId = null;
		if (queryParams?.chain && queryParams?.chainId) {
			chain = queryParams?.chain;
			chainId = queryParams?.chainId;
			const allowedChain = isChainIdAllowedForChain(chain, chainId);
			if (!allowedChain) throw new Error("Unsupported chain pair");
		}

		const cacheKey = `${chain}:${chainId}:${page}:tokens`;

		const cache = await redis.get(cacheKey);

		if (cache) {
			return JSON.parse(cache);
		}

		const query: MongooseBaseQueryOptions = {
			hidden: { $ne: true },
		};

		if (chain && chainId) {
			query.chain = chain;
			query.chainId = chainId;
		}

		const paginationOptions: PaginateOptions = {
			page: 1,
			lean: true,
			limit: 50,
			select: "-__v",
			leanWithId: false,
		};

		const tokensPaginated = await DB.Token.paginate(query, paginationOptions);

		const populatedTokens = await populateTokensWithLiveData(tokensPaginated.docs);

		const returnData = {
			...tokensPaginated,
			docs: populatedTokens,
		};

		await redis.setex(cacheKey, 10, JSON.stringify(returnData));

		return returnData;
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

		const cacheKey = `${chain}:${chainId}:${contractAddress}`;

		const cache = await redis.get(cacheKey);
		if (cache) {
			return JSON.parse(cache);
		}

		const token = await DB.Token.findOne({
			contractAddress,
			chainId,
			chain,
			hidden: { $ne: true },
		}).lean();

		if (!token) throw new Error("Token was not found");

		const populatedToken = await populateTokensWithLiveData([token]);

		await redis.setex(cacheKey, 8, JSON.stringify(populatedToken[0]));

		return token;
	});

	/** Upload the metadata of a token */
	fastify.post("/create", async (request) => {
		return true;
	});

	fastify.post("/trades", async (request) => {
		const { contractAddress, chain, chainId } = request.body as {
			contractAddress: Pick<IToken, "contractAddress">;
			chain: "solana" | "evm";
			chainId: TChainId;
		};
		const cacheKey = `${chain}:${chainId}:${contractAddress}:trades`;

		const allowedChain = isChainIdAllowedForChain(chain, chainId);
		if (!allowedChain) throw new Error("Unsupported chain pair");

		const cache = await redis.get(cacheKey);

		if (cache) {
			return JSON.parse(cache);
		}

		const token = await DB.Token.findOne({
			chain,
			chainId,
			contractAddress,
		})
			.select("decimals creator totalSupply")
			.lean();

		if (!token) {
			throw new Error(`Token: ${contractAddress} could not be found`);
		}

		const trades = await codex.queries.getTokenEvents({
			query: {
				address: contractAddress as unknown as string,
				// @ts-ignore
				networkId: CHAINID_TO_CODEX_NETWORK_ID[chain][chainId],
				eventType: EventType.Swap,
			},
			direction: RankingDirection.Desc,
			limit: 50,
		});

		const items = trades?.getTokenEvents?.items?.map((event) => {
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
				fromToken: "ETH",
				toAmount: trade?.data?.amountNonLiquidityToken || "0",
				txId: trade?.transactionHash,
				timestamp: trade?.timestamp ? trade?.timestamp * 1000 : new Date(),
				usdValue: trade?.data?.priceUsdTotal || null,
				type: trade?.eventDisplayType?.toLowerCase() || "buy",
			} as ITrade;
		});

		await redis.setex(cacheKey, 7, JSON.stringify(items));

		return items;
	});
	fastify.post("/holders", async (request) => {
		const { contractAddress, chain, chainId } = request.body as {
			contractAddress: Pick<IToken, "contractAddress">;
			chain: "solana" | "evm";
			chainId: TChainId;
		};
		const cacheKey = `${chain}:${chainId}:${contractAddress}:holders`;

		const allowedChain = isChainIdAllowedForChain(chain, chainId);
		if (!allowedChain) throw new Error("Unsupported chain pair");

		const cache = await redis.get(cacheKey);

		if (cache) {
			return JSON.parse(cache);
		}

		const token = await DB.Token.findOne({
			chain,
			chainId,
			contractAddress,
		})
			.select("decimals creator totalSupply")
			.lean();

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

		const items: IHolder[] = holders?.holders?.items?.splice(0, 50)?.map((item) => {
			const percentage = getPercentageOfTotal(Number(item.balance), Number(token.totalSupply));
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

		const exists = await DB.Token.findOne({
			contractAddress,
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
				getAddress(contractAddress),
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
				chain: "evm",
				chainId,
				contractAddress: getAddress(contractAddress),
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
				createdAt,
			};

			await DB.Token.create([{ ...tokenData, ...(await populateTokensWithLiveData([tokenData])) }]);
		} else if (chain === "solana") {
			const solanaChainId = chainId as unknown as SolanaNetworkIds;
			const rpc = new SolanaRpcProvider(solanaChainId);

			const metadata = await rpc.getTokenMetadata(contractAddress);

			if (!metadata?.image) throw new Error("Token has no image");

			const image = await uploadImageFromUrl(metadata?.image, `${chain}:${chainId}:${contractAddress}`, "token-images");

			const tokenData: IToken<"solana"> = {
				chain: "solana",
				chainId: solanaChainId,
				contractAddress: contractAddress as SolanaAddressLike,
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
				createdAt: new Date(),
			};

			await DB.Token.create([{ ...tokenData, ...(await populateTokensWithLiveData([tokenData])) }]);
		}

		return true;
	});
}
