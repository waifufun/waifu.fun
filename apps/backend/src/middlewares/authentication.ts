import type { FastifyRequest, FastifyReply } from "fastify";
import type { AddressLike } from "@waifufun/types";
import type { JWT } from "@fastify/jwt";
import { isAddress as isSolanaAddress } from "@solana/kit";
import { getChecksummedAddress } from "@waifufun/utils";
import DB from "@waifufun/database";
import { createHash } from "node:crypto";

declare module "fastify" {
	interface FastifyRequest {
		authUser?: {
			evm?: AddressLike;
			solana?: AddressLike;
		};
		jwt: JWT;
	}
}

const adjectives = ["Brave", "Silent", "Cosmic", "Swift", "Lucky", "Mighty", "Clever"];
const animals = ["Otter", "Falcon", "Lynx", "Wolf", "Tiger", "Fox", "Bear"];

// Map each animal to an emoji:
const animalEmojis: Record<string, string> = {
	Otter: "🦦",
	Falcon: "🦅",
	Lynx: "🐆",
	Wolf: "🐺",
	Tiger: "🐯",
	Fox: "🦊",
	Bear: "🐻",
};

function getDisplayName(address: string): string {
	const fullHash = createHash("sha256").update(address).digest("hex");
	const hashInt = Number.parseInt(fullHash.slice(0, 8), 16);

	const adj = adjectives[hashInt % adjectives.length] ?? "Anon";
	const animal = animals[(hashInt >> 4) % animals.length] ?? "User";
	const emoji = animalEmojis[animal] ?? "🐾";
	return `${emoji}${adj}${animal}`;
}
export async function ensureUserExists(address: AddressLike) {
	try {
		await DB.User.updateOne(
			{ address },
			{
				$setOnInsert: {
					address,
					displayName: getDisplayName(address),
					points: 50,
				},
			},
			{ upsert: true },
		);
		console.log(`[Auth] Ensured user exists: ${address} with 50 points`);
	} catch (error) {
		console.error(`[Auth] Error ensuring user exists for ${address}:`, error);
	}
}

export async function authenticationMiddleware(request: FastifyRequest, reply: FastifyReply) {
	try {
		const cookies = request.cookies || {};
		// Initialize authUser object
		request.authUser = {};

		if (process.env.NODE_ENV === "development" && !cookies.evm && !cookies.solana) {
			const defaultEVM = "0x0000000000000000000000000000000000000000";
			const defaultSolana = "11111111111111111111111111111111" as AddressLike;

			request.authUser = {
				evm: defaultEVM,
				solana: defaultSolana,
			};

			// Ensure default users exist in development
			await ensureUserExists(defaultEVM);
			await ensureUserExists(defaultSolana);

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
				const checksummedAddress = getChecksummedAddress(decoded.address, "solana");
				request.authUser.solana = checksummedAddress;

				// Ensure Solana user exists
				await ensureUserExists(checksummedAddress);
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
				const checksummedAddress = getChecksummedAddress(decoded.address, "evm");
				request.authUser.evm = checksummedAddress;

				// Ensure EVM user exists
				await ensureUserExists(checksummedAddress);
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
