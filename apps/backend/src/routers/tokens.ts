import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import type { AddressLike, IToken, TChain, TChainId, TURLLike } from "@autofun/types";
import { isChainIdAllowedForChain, isSupportedAddress } from "@autofun/utils";
import { EVMRpcProvider } from "@autofun/rpc";
import { getAddress } from "viem";

export default async function tokenRoutes(fastify: FastifyInstance) {
	/** Retrieve multiple tokens */
	fastify.get<{
		Reply: { tokens: IToken[] };
	}>("/", async (request, reply) => {
		const tokens = await DB.Token.find({
			hidden: { $ne: true },
		})
			.limit(10)
			.lean();
		return { tokens };
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

		const token = await DB.Token.findOne({
			contractAddress,
			chainId,
			chain,
			hidden: { $ne: true },
		}).lean();

		return token;
	});

	/** Upload the metadata of a token */
	fastify.post("/create", async (request) => {
		return true;
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
			const rpc = new EVMRpcProvider(chainId);

			/** TODO - Use multicall */
			const name = await rpc.readErc20Contract(getAddress(contractAddress), "name", []);
			const ticker = await rpc.readErc20Contract(getAddress(contractAddress), "symbol", []);
			const decimals = await rpc.readErc20Contract(getAddress(contractAddress), "decimals", []);
			const totalSupply = await rpc.readErc20Contract(getAddress(contractAddress), "totalSupply", []);

			if (BigInt(totalSupply) <= 0n) throw new Error("Total supply of token is 0");
			if (!name) throw new Error("Token has no name");
			if (!ticker) throw new Error("Token has no ticker");
			if (!decimals) throw new Error("Token has no decimals");

			const dexScreenerCall = (await fetch(`https://api.dexscreener.com/tokens/v1/base/${contractAddress}`).then(
				async (resp) => await resp.json(),
			)) as { marketCap: number; pairCreatedAt: Date; priceUsd: number; volume: { h24: number } }[];

			const dexscreenerData = dexScreenerCall?.[0];

			if (!dexscreenerData) throw new Error("Token information could not be determined");

			const image =
				`https://dd.dexscreener.com/ds-data/tokens/base/${contractAddress.toLowerCase()}.png?size=xl` as TURLLike;

			const marketcap = dexscreenerData?.marketCap || 0;
			const createdAt = dexscreenerData?.pairCreatedAt || new Date();
			const price = dexscreenerData?.priceUsd || 0;
			const volume24h = dexscreenerData?.volume?.h24 || 0;

			const tokenData: IToken<"evm"> = {
				chain: "evm",
				chainId,
				contractAddress: getAddress(contractAddress),
				ticker: String(name),
				name: String(name),
				imported: true,
				image,
				price,
				marketcap,
				volume24h,
				socials: {},
				hidden: false,
				decimals: Number(decimals),
				totalSupply: Number(totalSupply),
				createdAt,
			};

			await DB.Token.create([tokenData]);
		} else if (chain === "solana") {
		}

		return true;
	});
}
