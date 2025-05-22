import type { FastifyRequest, FastifyReply } from "fastify";
import type { AddressLike } from "@autofun/types";
import type { JWT } from "@fastify/jwt";

declare module "fastify" {
	interface FastifyRequest {
		authUser?: {
			evm?: AddressLike;
			solana?: AddressLike;
		};
		jwt: JWT;
	}
}

export async function authenticationMiddleware(request: FastifyRequest, reply: FastifyReply) {
	try {
		if (process.env.NODE_ENV === "development") {
			request.authUser = {
				evm: "0x0000000000000000000000000000000000000000",
				solana: "0x0000000000000000000000000000000000000000",
			};
			return;
		}

		const { solana, evm } = request.cookies;
		const user: { evm?: AddressLike; solana?: AddressLike } = {};

		if (solana) {
			try {
				const decoded = request.jwt.decode(solana) as { address: AddressLike };
				user.solana = decoded.address;
			} catch (error) {
				reply.clearCookie("solana");
			}
		}

		if (evm) {
			try {
				const decoded = request.jwt.decode(evm) as { address: AddressLike };
				user.evm = decoded.address;
			} catch (error) {
				reply.clearCookie("evm");
			}
		}

		if (!user.evm && !user.solana) {
			return reply.code(401).send({ error: "Unauthorized" });
		}

		request.authUser = user;
	} catch (error) {
		return reply.code(401).send({ error: "Unauthorized" });
	}
}
