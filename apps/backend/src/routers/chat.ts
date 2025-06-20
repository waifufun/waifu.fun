import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import type { AddressLike, SolanaAddressLike, TChain, TChainId, TChatRooms } from "@autofun/types";
import { getChecksummedAddress, isChainIdAllowedForChain } from "@autofun/utils";
import { uploadBase64Image } from "@autofun/s3-uploader";
import { randomUUID } from "node:crypto";
import redis from "@autofun/redis";
import { SolanaRpcProvider } from "@autofun/rpc";

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
			attachment: Base64URLString;
		};

		if (!body?.message || !body?.room || !body?.contractAddress) {
			throw new Error("Missing one of the following parameters: message, room, contractAddress");
		}

		const solanaAddress = request?.authUser?.solana;

		if (body.chain !== "solana") {
			throw new Error("Unsupported chain for chat messages");
		}

		if (!solanaAddress) {
			throw new Error("You must be logged in to send a message");
		}

		const rpc = new SolanaRpcProvider(101);
		const amountOfTokens = await rpc.getTokenBalance(body.contractAddress as AddressLike, solanaAddress);

		try {
			const roomWanted = Number(body.room);
			if (roomWanted >= amountOfTokens) {
				throw new Error("You do not have enough tokens to send a message in this room");
			}
		} catch (error) {
			throw new Error(error instanceof Error ? error.message : "Invalid room or token balance check failed");
		}

		const allowedChain = isChainIdAllowedForChain(body.chain, body.chainId);
		if (!allowedChain) throw new Error("Unsupported chain pair");

		const allowedRooms = ["1000", "100000", "1000000"];

		if (!allowedRooms?.includes(body.room)) {
			throw new Error("Chat room does not exist");
		}

		const floodKey = `${JSON.stringify(request.authUser)}:chat`;

		const isFlooding = await redis.get(floodKey);

		if (isFlooding) {
			throw new Error("You sent a message too recently");
		}

		let image = undefined;

		if (body.attachment) {
			image = await uploadBase64Image(body.attachment, randomUUID(), "chat", 500, 500);
		}

		await DB.ChatMessage.create([
			{
				contractAddress: body.contractAddress,
				message: body.message,
				room: body?.room,
				sender: getChecksummedAddress(request?.authUser?.solana as SolanaAddressLike, "solana"),
				image,
			},
		]);

		await redis.setex(floodKey, 10, JSON.stringify({ status: true }));

		return { status: "OK" };
	});
}
