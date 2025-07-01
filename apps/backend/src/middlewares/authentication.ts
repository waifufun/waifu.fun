import type { FastifyRequest, FastifyReply } from "fastify";
import type { AddressLike } from "@autofun/types";
import type { JWT } from "@fastify/jwt";
import { isAddress as isSolanaAddress } from "@solana/kit";
import { getChecksummedAddress } from "@autofun/utils";

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
		console.log("cookies: ", cookies);

		// Initialize authUser object
		request.authUser = {};

		if (process.env.NODE_ENV === "development" && !cookies.evm && !cookies.solana) {
			request.authUser = {
				evm: "0x0000000000000000000000000000000000000000",
				solana: "11111111111111111111111111111111" as AddressLike,
			};
			console.log("[Auth] Development mode - using default addresses");
			return;
		}

		const { solana, evm } = cookies;

		if (solana) {
			try {
				const decoded = request.server.jwt.decode(solana) as { address: AddressLike };
				if (!isSolanaAddress(decoded.address)) {
					throw new Error("Invalid Solana address");
				}
				request.authUser.solana = getChecksummedAddress(decoded.address, "solana");
				console.log("[Auth] Successfully decoded Solana address");
			} catch (error) {
				console.log("[Auth] Failed to decode Solana address:", error);
				reply.clearCookie("solana", {
					path: "/",
					httpOnly: true,
					secure: process.env.NODE_ENV === "production",
					sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
					...(process.env.NODE_ENV === "development" && { domain: "localhost" }),
				});
			}
		}

		if (evm) {
			try {
				const decoded = request.server.jwt.decode(evm) as { address: AddressLike };
				request.authUser.evm = getChecksummedAddress(decoded.address, "evm");
				console.log("[Auth] Successfully decoded EVM token");
			} catch (error) {
				console.log("[Auth] Failed to decode EVM address:", error);
				reply.clearCookie("evm", {
					path: "/",
					httpOnly: true,
					secure: process.env.NODE_ENV === "production",
					sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
					...(process.env.NODE_ENV === "development" && { domain: "localhost" }),
				});
			}
		}

		if (!request.authUser.evm && !request.authUser.solana) {
			console.log("[Auth] No valid addresses found, but continuing...");
			request.authUser = undefined;
		}

		console.log("[Auth] Final authUser:", request.authUser);
	} catch (error) {
		console.log("[Auth] Authentication failed:", error);
		request.authUser = undefined;
	}
}
