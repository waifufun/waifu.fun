import type { FastifyInstance } from "fastify";
import redis from "@autofun/redis";
import type { AddressLike, TChain } from "@autofun/types";
import { VerifySolanaSignature } from "../crypto/utils";
import { verifyMessage } from "viem";
import { getChecksummedAddress } from "@autofun/utils";
import { ensureUserExists } from "../middlewares/authentication";

export default async function authRoutes(fastify: FastifyInstance) {
	fastify.post("/generateNonce", async (request) => {
		const { address } = request.body as { address: AddressLike };
		if (!address) {
			return { error: "Address is required" };
		}

		const nonce = Math.floor(Math.random() * 1000000).toString();
		await redis.set(`nonce:${address}`, nonce, "EX", 60 * 5);
		return { nonce };
	});

	fastify.get("/status", async (request, reply) => {
		try {
			const { solana, evm } = request.cookies;
			console.log("[Auth] Status check - received cookies:", { solana: !!solana, evm: !!evm });

			const wallets = {
				solana: null as { address: AddressLike } | null,
				evm: null as { address: AddressLike } | null,
			};

			if (!solana && !evm) {
				console.log("[Auth] No cookies found");
				return {
					authenticated: false,
					wallets,
					message: "No authentication cookies found",
				};
			}

			try {
				const solanaToken = solana ? (fastify.jwt.decode(solana) as { address: AddressLike } | null) : null;
				const evmToken = evm ? (fastify.jwt.decode(evm) as { address: AddressLike } | null) : null;

				console.log("[Auth] Decoded tokens:", {
					solanaToken: solanaToken ? { address: solanaToken.address } : null,
					evmToken: evmToken ? { address: evmToken.address } : null,
				});

				if (solanaToken) {
					wallets.solana = {
						address: solanaToken.address,
					};
					// Ensure user exists in database
					await ensureUserExists(solanaToken.address);
				}

				if (evmToken) {
					wallets.evm = {
						address: evmToken.address,
					};
					// Ensure user exists in database
					await ensureUserExists(evmToken.address);
				}

				const isAuthenticated = !!(wallets.solana || wallets.evm);
				console.log("[Auth] Authentication result:", { isAuthenticated, wallets });

				return {
					authenticated: isAuthenticated,
					wallets,
					message: isAuthenticated ? "User is authenticated" : "Invalid authentication cookies",
				};
			} catch (error) {
				console.error("Error decoding authentication cookies:", error);

				// Clear invalid cookies
				if (solana) {
					console.log("[Auth] Clearing invalid solana cookie");
					reply.clearCookie("solana", {
						path: "/",
						httpOnly: true,
						secure: process.env.NODE_ENV === "production",
						sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
						domain: process.env.NODE_ENV === "development" ? "localhost" : undefined,
					});
				}

				if (evm) {
					console.log("[Auth] Clearing invalid evm cookie");
					reply.clearCookie("evm", {
						path: "/",
						httpOnly: true,
						secure: process.env.NODE_ENV === "production",
						sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
						domain: process.env.NODE_ENV === "development" ? "localhost" : undefined,
					});
				}

				return {
					authenticated: false,
					wallets,
					message: "Invalid authentication cookies cleared",
				};
			}
		} catch (error) {
			console.error("Error checking authentication status:", error);
			return reply.code(500).send({
				authenticated: false,
				wallets: { solana: null, evm: null },
				message: "Error checking authentication status",
			});
		}
	});

	fastify.post("/authenticate", async (request, reply) => {
		const { address, signature, chain } = request.body as { address: AddressLike; signature: string; chain: TChain };

		if (!address || !signature || !chain) {
			return reply.code(400).send({ error: "Address, signature, and chain are required" });
		}

		const nonce = await redis.get(`nonce:${address}`);
		if (!nonce) {
			return reply.code(400).send({ error: "Nonce not found or expired" });
		}

		let isValid = false;
		let token: string;
		let checksummedAddress: AddressLike;

		switch (chain) {
			case "solana": {
				isValid = await VerifySolanaSignature(nonce, signature, address);
				if (!isValid) {
					console.log("not valid solana signature");
					return reply.code(401).send({ error: "Invalid signature" });
				}

				checksummedAddress = getChecksummedAddress(address, "solana");
				const solPayload = {
					address: checksummedAddress,
					nonce,
				};

				token = fastify.jwt.sign(solPayload, {
					expiresIn: "7d",
				});

				reply.setCookie("solana", token, {
					maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
					path: "/",
					httpOnly: true,
					secure: process.env.NODE_ENV === "production",
					sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
					domain: process.env.NODE_ENV === "development" ? "localhost" : undefined,
				});

				// console.log(`[Auth] Setting solana cookie for address: ${checksummedAddress}`);
				// console.log("[Auth] Cookie settings:", {
				// 	maxAge: 60 * 60 * 24 * 7,
				// 	path: "/",
				// 	httpOnly: true,
				// 	secure: process.env.NODE_ENV === "production",
				// 	sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
				// });

				// Ensure user exists in database
				await ensureUserExists(checksummedAddress);

				return reply.send({ success: true, message: "Authenticated successfully" });
			}
			case "evm": {
				isValid = await verifyMessage({
					address: address as `0x${string}`,
					message: nonce,
					signature: signature as `0x${string}`,
				});
				if (!isValid) {
					console.log("invalid evm signature.");
					return reply.code(401).send({ error: "Invalid signature" });
				}

				checksummedAddress = getChecksummedAddress(address, "evm");
				const evmPayload = {
					address: checksummedAddress,
					nonce,
				};

				token = fastify.jwt.sign(evmPayload, {
					expiresIn: "7d",
				});

				reply
					.setCookie("evm", token, {
						maxAge: 60 * 60 * 24 * 7,
						path: "/",
						httpOnly: true,
						secure: process.env.NODE_ENV === "production",
						sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
						domain: process.env.NODE_ENV === "development" ? "localhost" : undefined,
					})
					.send({ success: true, message: "Authenticated successfully" });

				// Ensure user exists in database
				await ensureUserExists(checksummedAddress);
				break;
			}
			default:
				return reply.code(400).send({ error: "Unsupported chain" });
		}

		await redis.del(`nonce:${address}`);
	});

	fastify.get("/getWallets", async (request, reply) => {
		const { solana, evm } = request.cookies;

		const wallets = {
			solana: null as { address: AddressLike } | null,
			evm: null as { address: AddressLike } | null,
		};

		if (!solana && !evm) {
			return { wallets };
		}

		try {
			const solanaToken = solana ? (fastify.jwt.decode(solana) as { address: AddressLike } | null) : null;
			const evmToken = evm ? (fastify.jwt.decode(evm) as { address: AddressLike } | null) : null;

			if (solanaToken) {
				wallets.solana = {
					address: solanaToken.address,
				};
			}

			if (evmToken) {
				wallets.evm = {
					address: evmToken.address,
				};
			}

			return { wallets };
		} catch (error) {
			// remove invalid cookies
			reply.clearCookie("solana", {});

			reply.clearCookie("evm", {});

			return { wallets };
		}
	});

	fastify.post("/logout", async (request, reply) => {
		const { chain } = request.body as { chain: TChain };
		if (!chain) {
			return reply.code(400).send({ error: "Chain is required" });
		}

		reply.clearCookie(chain, {
			path: "/",
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
			domain: process.env.NODE_ENV === "development" ? "localhost" : undefined,
		});

		return reply.send({ success: true, message: "Logged out successfully" });
	});

	// this is for develepoment to get a cookie for postman {/* Malibu */}
	if (process.env.NODE_ENV === "development") {
		fastify.get("/dev-setup", async (_request, reply) => {
			const evmPayload = {
				address: "0x0000000000000000000000000000000000000000",
				nonce: "dev",
			};

			const solanaPayload = {
				address: "11111111111111111111111111111111",
				nonce: "dev",
			};

			const evmToken = fastify.jwt.sign(evmPayload, {
				expiresIn: "7d",
			});

			const solanaToken = fastify.jwt.sign(solanaPayload, {
				expiresIn: "7d",
			});

			// Ensure default users exist in development
			await ensureUserExists(evmPayload.address as AddressLike);
			await ensureUserExists(solanaPayload.address as AddressLike);

			reply
				.setCookie("evm", evmToken, {
					maxAge: 60 * 60 * 24 * 7,
					path: "/",
					httpOnly: true,
					secure: false,
				})
				.setCookie("solana", solanaToken, {
					maxAge: 60 * 60 * 24 * 7,
					path: "/",
					httpOnly: true,
					secure: false,
				})
				.send({
					success: true,
					message: "Development cookies set",
					cookies: {
						evm: evmToken,
						solana: solanaToken,
					},
				});
		});
	}
}
