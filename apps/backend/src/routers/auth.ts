import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import redis from "@autofun/redis";
import type { AddressLike, TChain } from "@autofun/types";
import { VerifySolanaSignature } from "../crypto/utils";
import { verifyMessage } from "viem";
export default async function authRoutes(fastify: FastifyInstance) {
	fastify.register(fastifyCookie);
	fastify.post("/generateNonce", async (request) => {
		const { address } = request.body as { address: AddressLike };
		if (!address) {
			return { error: "Address is required" };
		}

		const nonce = Math.floor(Math.random() * 1000000).toString();
		await redis.set(`nonce:${address}`, nonce, "EX", 60 * 5);
		return { nonce };
	});

	fastify.post("/authenticate", async (request, reply) => {
		const { address, signature, chain } = request.body as { address: AddressLike; signature: string; chain: TChain };

		if (!address || !signature || !chain) {
			return { error: "Address, signature, and chain are required" };
		}

		const nonce = await redis.get(`nonce:${address}`);
		if (!nonce) {
			return { error: "Nonce not found or expired" };
		}

		switch (chain) {
			case "solana": {
				const isValidSol = await VerifySolanaSignature(nonce, signature, address);

				if (!isValidSol) {
					return { error: "Invalid signature" };
				}

				const solanaAddress = address as `0x${string}`;
				const solPayload = {
					address: solanaAddress,
					nonce,
				};

				const solanaToken = fastify.jwt.sign(solPayload, {
					expiresIn: "7d",
				});

				reply
					.setCookie("solana", solanaToken, {
						maxAge: 60 * 60 * 24 * 7,
						path: "/",
						httpOnly: true,
						secure: process.env.NODE_ENV === "production",
					})
					.send({ success: true, message: "Authenticated successfully" });
				break;
			}
			case "evm": {
				const isValidEVM = await verifyMessage({
					address: address as `0x${string}`,
					message: nonce,
					signature: signature as `0x${string}`,
				});
				if (!isValidEVM) {
					return { error: "Invalid signature" };
				}

				const evmAddress = address as `0x${string}`;

				const evmPayload = {
					address: evmAddress,
					nonce,
				};

				const evmToken = fastify.jwt.sign(evmPayload, {
					expiresIn: "7d",
				});

				reply
					.setCookie("evm", evmToken, {
						maxAge: 60 * 60 * 24 * 7,
						path: "/",
						httpOnly: true,
						secure: process.env.NODE_ENV === "production",
					})
					.send({ success: true, message: "Authenticated successfully" });
				break;
			}
			default:
				return { error: "Unsupported chain" };
		}
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
			return { error: "Chain is required" };
		}

		reply.clearCookie(chain, {
			path: "/",
		});

		return { success: true, message: "Logged out successfully" };
	});
}
