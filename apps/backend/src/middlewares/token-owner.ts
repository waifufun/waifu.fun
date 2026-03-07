import type { FastifyRequest, FastifyReply } from "fastify";
import type { AddressLike, TChain, TChainId } from "@waifufun/types";
import DB from "@waifufun/database";

declare module "fastify" {
	interface FastifyRequest {
		authUser?: {
			evm?: AddressLike;
			solana?: AddressLike;
		};
	}
}

export async function requireTokenOwner(request: FastifyRequest, reply: FastifyReply) {
	const user = request.authUser;

	if (!user?.evm && !user?.solana) {
		return reply.code(401).send({
			success: false,
			error: "Authentication required",
		});
	}

	const userAddress = user.evm || user.solana;
	if (!userAddress) {
		return reply.code(401).send({
			success: false,
			error: "Valid wallet address required",
		});
	}

	const { mint, chain, chainId } = request.params as {
		mint: string;
		chain?: TChain;
		chainId?: TChainId;
	};
	if (!mint) {
		return reply.code(400).send({
			success: false,
			error: "Token mint required",
		});
	}

	try {
		// Fetch token data to check ownership
		const tokenLookup: {
			contractAddress: string;
			chain?: TChain;
			chainId?: TChainId;
		} = {
			contractAddress: mint,
		};

		if (chain !== undefined) tokenLookup.chain = chain;
		if (chainId !== undefined) tokenLookup.chainId = chainId;

		const tokenData = await DB.Token.findOne(tokenLookup)
			.select("creator")
			.lean();

		if (!tokenData) {
			return reply.code(404).send({
				success: false,
				error: "Token not found",
			});
		}

		const tokenCreator = tokenData.creator;

		if (!tokenCreator || tokenCreator !== userAddress) {
			console.warn(
				`Ownership check failed: User ${userAddress} tried to access owner route for token ${mint} owned by ${tokenCreator || "not found"}`,
			);
			return reply.code(403).send({
				success: false,
				error: "Token ownership required",
			});
		}
	} catch (error) {
		console.error("Error checking token ownership:", error);
		return reply.code(500).send({
			success: false,
			error: "Failed to verify token ownership",
		});
	}
}
