import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import type { AddressLike, TChain, TChainId, TChatRooms } from "@autofun/types";
import { isChainIdAllowedForChain } from "@autofun/utils";

export default async function chatRoutes(fastify: FastifyInstance) {
	fastify.post("/history", async (request) => {
		const body = request.body as {
			room: TChatRooms;
			contractAddress: AddressLike;
			chain: TChain;
			chainId: TChainId;
		};

		if (!body?.room || !body?.contractAddress) throw new Error("Missing contractAddress or room");

		const allowedChain = isChainIdAllowedForChain(body.chain, body.chainId);
		if (!allowedChain) throw new Error("Unsupported chain pair");

		const messages = await DB.ChatMessage.find({
			room: body.room,
			contractAddress: body.contractAddress,
		})
			.sort("-createdAt")
			.limit(100)
			.lean();

		return messages;
	});

	fastify.post("/message", async (request) => {
		const body = request.body as {
			message: string;
			room: TChatRooms;
			contractAddress: AddressLike;
			chain: TChain;
			chainId: TChainId;
		};

		if (!body?.message || !body?.room || !body?.contractAddress) {
			throw new Error("Missing one of the following parameters: message, room, contractAddress");
		}

		const allowedChain = isChainIdAllowedForChain(body.chain, body.chainId);
		if (!allowedChain) throw new Error("Unsupported chain pair");

		await DB.ChatMessage.create([
			{
				contractAddress: body.contractAddress,
				message: body.message,
				room: body?.room,
			},
		]);

		return { status: "OK" };
	});
}
