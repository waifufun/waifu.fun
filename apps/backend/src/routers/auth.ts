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
			case "solana":
				const isValidSol = await VerifySolanaSignature(nonce, signature, address);

				if (!isValidSol) {
					return { error: "Invalid signature" };
				}

				const solanaAddress = address as `0x${string}`;

				reply.setCookie("solana", solanaAddress, {
					maxAge: 60 * 60 * 24 * 7,
				});

				return { success: true, address: solanaAddress };
			case "evm":
				const isValidEVM = await verifyMessage({
					address: address as `0x${string}`,
					message: nonce,
					signature: signature as `0x${string}`,
				});
				if (!isValidEVM) {
					return { error: "Invalid signature" };
				}

				const evmAddress = address as `0x${string}`;
				reply.setCookie("evm", evmAddress, {
					maxAge: 60 * 60 * 24 * 7,
				});

				return { success: true, address: evmAddress };
			default:
				return { error: "Unsupported chain" };
		}
	});

	fastify.get("/getWallets", async (request, reply) => {
		const { solana, evm } = request.cookies;
		const wallets = {
			solana: solana || null,
			evm: evm || null,
		};
		return { wallets };
	});
}
