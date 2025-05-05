import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import type { AddressLike, IToken, TChain } from "@autofun/types";
import { isChainIdAllowedForChain, isSupportedAddress } from "@autofun/utils";

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
			chainId: Omit<IToken, "chainId">;
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
			chainId: Omit<IToken, "chainId">;
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

		return true;
	});
}
