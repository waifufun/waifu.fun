import { type FastifyInstance, type FastifyPluginOptions } from "fastify";
import redis from "@autofun/redis";
import DB from "@autofun/database";
import { type AddressLike, type IToken } from "@autofun/types";

export default async function tokenRoutes(fastify: FastifyInstance) {
	/** Retrieve multiple tokens */
	fastify.get<{
		Params: {};
		QueryParams: {};
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
			contractAddress: AddressLike;
		};
		Reply: IToken | null;
	}>("/:contractAddress", async (request) => {
		const { contractAddress } = request.params;

		const token = await DB.Token.findOne({
			contractAddress,
			hidden: { $ne: true },
		}).lean();

		return token;
	});

	/** Upload the metadata of a token */
	fastify.post<{
		Body: {};
	}>("/create", async (request) => {
		return true;
	});

	/** Import an existing token */
	fastify.post<{
		Body: {
			contractAddress: AddressLike;
		};
	}>("/import", async (request) => {
		const body = request.body;
		return true;
	});
}
