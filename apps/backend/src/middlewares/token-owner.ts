import type { FastifyReply, FastifyRequest } from "fastify";
import type { AddressLike, TChain, TChainId } from "@waifufun/types";
import { getTokenRuntimeContext, type TokenRuntimeContext } from "../services/owner-runtime-control-plane";

declare module "fastify" {
	interface FastifyRequest {
		authUser?: {
			evm?: AddressLike;
			solana?: AddressLike;
		};
		tokenRuntimeContext?: TokenRuntimeContext;
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

	if (!chain || chainId === undefined) {
		return reply.code(400).send({
			success: false,
			error: "Token chain and chainId are required",
		});
	}

	try {
		const context = await getTokenRuntimeContext(
			{
				mint,
				chain,
				chainId,
			},
			user,
		);

		if (!context) {
			return reply.code(404).send({
				success: false,
				error: "Token not found",
			});
		}

		if (!context.matchedWallet) {
			const attemptedWallets = [user.evm, user.solana].filter(Boolean).join(", ");
			console.warn(
				`Ownership check failed: User ${attemptedWallets || "unknown"} tried to access owner route for token ${mint} on ${chain}:${chainId}`,
			);
			return reply.code(403).send({
				success: false,
				error: "Token ownership required",
			});
		}

		request.tokenRuntimeContext = context;
	} catch (error) {
		console.error("Error checking token ownership:", error);
		return reply.code(500).send({
			success: false,
			error: "Failed to verify token ownership",
		});
	}
}
