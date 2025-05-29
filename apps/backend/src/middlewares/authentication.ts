import type { FastifyRequest, FastifyReply } from "fastify";
import type { AddressLike } from "@autofun/types";
import type { JWT } from "@fastify/jwt";
import { isAddress as isSolanaAddress } from "@solana/kit";

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
		const cookies = request.cookies || {};
		if (process.env.NODE_ENV === "development" && !cookies.evm && !cookies.solana) {
			request.authUser = {
				evm: "0x0000000000000000000000000000000000000000",
				solana: "11111111111111111111111111111111" as AddressLike,
			};
			console.log("[Auth] Development mode - using default addresses");
			return;
		}

		const { solana, evm } = cookies;

		const user: { evm?: AddressLike; solana?: AddressLike } = {};

		if (solana) {
			try {
				const decoded = request.server.jwt.decode(solana) as { address: AddressLike };
				if (!isSolanaAddress(decoded.address)) {
					throw new Error("Invalid Solana address in token");
				}
				user.solana = decoded.address;
				console.log("[Auth] Successfully decoded Solana token");
			} catch (error) {
				console.log("[Auth] Failed to decode Solana token:", error);
				reply.clearCookie("solana");
			}
		}

		if (evm) {
			try {
				const decoded = request.server.jwt.decode(evm) as { address: AddressLike };
				user.evm = decoded.address;
				console.log("[Auth] Successfully decoded EVM token");
			} catch (error) {
				console.log("[Auth] Failed to decode EVM token:", error);
				reply.clearCookie("evm");
			}
		}

		if (!user.evm && !user.solana) {
			console.log("[Auth] No valid tokens found");
			return reply.code(401).send({ error: "Unauthorized" });
		}

		request.authUser = user;
		console.log("[Auth] Authentication successful");
	} catch (error) {
		console.log("[Auth] Authentication failed:", error);
		return reply.code(401).send({ error: "Unauthorized" });
	}
}
