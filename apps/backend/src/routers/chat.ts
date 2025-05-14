import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import type { AddressLike, TChatRooms } from "@autofun/types";

export default async function chatRoutes(fastify: FastifyInstance) {
	// TODO - Add authentication middleware
	fastify.post("/history", async (request) => {
		const body = request.body as { room: TChatRooms; contractAddress: AddressLike };

		if (!body?.room || !body?.contractAddress) throw new Error("Missing contractAddress or room");

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
		const body = request.body as { message: string; room: TChatRooms; contractAddress: AddressLike };

		if (!body?.message || !body?.room || !body?.contractAddress) {
			throw new Error("Missing one of the following parameters: message, room, contractAddress");
		}

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
