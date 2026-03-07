import type { FastifyInstance } from "fastify";
import type { TChain, TChainId } from "@waifufun/types";
import DB from "@waifufun/database";
import { requireTokenOwner } from "../middlewares/token-owner";
import { modifyFile, extractObjectKeyFromUrl } from "@waifufun/s3-uploader";
import { sanitizeSocialLink } from "../utils/tokens/sanitize-links";

type TokenRouteParams = {
	mint: string;
	chain: TChain;
	chainId: TChainId;
};

type RuntimeCharacter = {
	name?: string;
	bio?: string;
	avatar?: string;
};

export default async function ownerRoutes(fastify: FastifyInstance) {
	fastify.post(
		"/tokens/:chain/:chainId/:mint/social",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as { mint: string; chain: TChain; chainId: TChainId };
				const { twitter, telegram, discord, website, farcaster } = request.body as {
					twitter?: string;
					telegram?: string;
					discord?: string;
					website?: string;
					farcaster?: string;
				};

				const tokenData = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				if (!tokenData) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				const updateData: Record<string, unknown> = {};
				if (twitter !== undefined) updateData["socials.twitter"] = sanitizeSocialLink(twitter);
				if (telegram !== undefined) updateData["socials.telegram"] = sanitizeSocialLink(telegram);
				if (discord !== undefined) updateData["socials.discord"] = sanitizeSocialLink(discord);
				if (website !== undefined) updateData["socials.website"] = sanitizeSocialLink(website);
				if (farcaster !== undefined) updateData["socials.farcaster"] = sanitizeSocialLink(farcaster);

				await DB.Token.updateOne(
					{
						contractAddress: mint,
						chain,
						chainId,
					},
					{ $set: updateData },
				);

				if (tokenData.metadataUrl && !tokenData.imported) {
					try {
						const objectKey = extractObjectKeyFromUrl(tokenData.metadataUrl);
						const fileName = objectKey.replace("token-metadata/", "");

						const currentMetadata = {
							name: tokenData.name || "",
							symbol: tokenData.ticker || "",
							description: tokenData.description || "",
							image: tokenData.image || "",
							twitter: twitter !== undefined ? twitter : tokenData.socials?.twitter || "",
							telegram: telegram !== undefined ? telegram : tokenData.socials?.telegram || "",
							website: website !== undefined ? website : tokenData.socials?.website || "",
							discord: discord !== undefined ? discord : tokenData.socials?.discord || "",
							createdOn: "https://waifu.fun/",
						};

						const metadataBuffer = Buffer.from(JSON.stringify(currentMetadata, null, 2), "utf8");
						await modifyFile("token-metadata", fileName, metadataBuffer);
					} catch (metadataError) {
						console.error("Error updating metadata file:", metadataError);
					}
				}

				const updatedToken = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				const ownerUser = request.authUser;
				const ownerAddress = ownerUser?.evm || ownerUser?.solana;
				console.log(`Owner ${ownerAddress} updated social links for token ${mint} on ${chain}:${chainId}`);

				return {
					success: true,
					message: "Token social links updated successfully",
					token: updatedToken,
				};
			} catch (error) {
				console.error("Error updating token social links:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	// Get token owner info (owner only)
	fastify.get(
		"/tokens/:chain/:chainId/:mint/owner-info",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as { mint: string; chain: TChain; chainId: TChainId };

				const tokenData = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				if (!tokenData) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				const ownerData = await DB.User.findOne({
					address: tokenData.creator,
				}).lean();

				return {
					success: true,
					token: tokenData,
					owner: ownerData || null,
				};
			} catch (error) {
				console.error("Error getting token owner info:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	fastify.get(
		"/tokens/:chain/:chainId/:mint/runtime",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as TokenRouteParams;

				const tokenData = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				if (!tokenData) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				if (!tokenData.cloudAgentId) {
					return {
						success: true,
						runtime: {
							hasAgent: false,
							agentStatus: "none",
						},
					};
				}

				return {
					success: true,
					runtime: {
						cloudAgentId: tokenData.cloudAgentId,
						agentStatus: tokenData.agentStatus,
						agentLifecycleState: tokenData.agentLifecycleState,
						webUiUrl: tokenData.webUiUrl,
						billingMode: tokenData.billingMode,
						infraReserveUsd: tokenData.infraReserveUsd,
						hasAgent: true,
					},
				};
			} catch (error) {
				console.error("Error getting token runtime:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	fastify.post(
		"/tokens/:chain/:chainId/:mint/runtime/activate",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as TokenRouteParams;
				const { character, billingMode } = request.body as {
					character?: RuntimeCharacter;
					billingMode?: string;
				};

				const tokenData = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				if (!tokenData) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				if (tokenData.agentStatus === "running" || tokenData.agentStatus === "provisioning") {
					return reply.code(400).send({
						success: false,
						error: `Agent is already ${tokenData.agentStatus}`,
					});
				}

				const updateData: Record<string, unknown> = {
					agentStatus: "provisioning",
				};

				if (billingMode !== undefined) {
					updateData.billingMode = billingMode;
				}

				if (character !== undefined) {
					updateData.agentCharacterConfig = character;
				}

				await DB.Token.updateOne(
					{
						contractAddress: mint,
						chain,
						chainId,
					},
					{ $set: updateData },
				);

				return {
					success: true,
					message: "Agent provisioning requested",
					agentStatus: "provisioning",
				};
			} catch (error) {
				console.error("Error activating token runtime:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	fastify.post(
		"/tokens/:chain/:chainId/:mint/runtime/suspend",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as TokenRouteParams;

				const tokenData = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				if (!tokenData) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				if (tokenData.agentStatus !== "running") {
					return reply.code(400).send({
						success: false,
						error: "Agent must be running to suspend",
					});
				}

				await DB.Token.updateOne(
					{
						contractAddress: mint,
						chain,
						chainId,
					},
					{ $set: { agentStatus: "suspended" } },
				);

				return {
					success: true,
					message: "Agent suspended",
				};
			} catch (error) {
				console.error("Error suspending token runtime:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	fastify.post(
		"/tokens/:chain/:chainId/:mint/runtime/resume",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as TokenRouteParams;

				const tokenData = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				if (!tokenData) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				if (tokenData.agentStatus !== "suspended") {
					return reply.code(400).send({
						success: false,
						error: "Agent must be suspended to resume",
					});
				}

				await DB.Token.updateOne(
					{
						contractAddress: mint,
						chain,
						chainId,
					},
					{ $set: { agentStatus: "provisioning" } },
				);

				return {
					success: true,
					message: "Agent resume requested",
				};
			} catch (error) {
				console.error("Error resuming token runtime:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	fastify.get(
		"/tokens/:chain/:chainId/:mint/billing",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as TokenRouteParams;

				const tokenData = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				if (!tokenData) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				return {
					success: true,
					billingMode: tokenData.billingMode,
					infraReserveUsd: tokenData.infraReserveUsd,
					agentStatus: tokenData.agentStatus,
					estimatedDailyBurn: 0,
				};
			} catch (error) {
				console.error("Error getting token billing:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	// Update token description (owner only)
	fastify.post(
		"/tokens/:chain/:chainId/:mint/description",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as { mint: string; chain: TChain; chainId: TChainId };
				const { description } = request.body as { description: string };

				if (!description || description.length > 1000) {
					return reply.code(400).send({
						success: false,
						error: "Description is required and must be less than 1000 characters",
					});
				}

				const tokenData = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				if (!tokenData) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				await DB.Token.updateOne(
					{
						contractAddress: mint,
						chain,
						chainId,
					},
					{ $set: { description } },
				);

				if (tokenData.metadataUrl) {
					try {
						const objectKey = extractObjectKeyFromUrl(tokenData.metadataUrl);
						const fileName = objectKey.replace("token-metadata/", "");

						const currentMetadata = {
							name: tokenData.name || "",
							symbol: tokenData.ticker || "",
							description: description,
							image: tokenData.image || "",
							twitter: tokenData.socials?.twitter || "",
							telegram: tokenData.socials?.telegram || "",
							website: tokenData.socials?.website || "",
							discord: tokenData.socials?.discord || "",
							createdOn: "https://waifu.fun/",
						};

						const metadataBuffer = Buffer.from(JSON.stringify(currentMetadata, null, 2), "utf8");
						await modifyFile("token-metadata", fileName, metadataBuffer);
					} catch (metadataError) {
						console.error("Error updating metadata file:", metadataError);
					}
				}

				const updatedToken = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				const ownerUser = request.authUser;
				const ownerAddress = ownerUser?.evm || ownerUser?.solana;
				console.log(`Owner ${ownerAddress} updated description for token ${mint} on ${chain}:${chainId}`);

				return {
					success: true,
					message: "Token description updated successfully",
					token: updatedToken,
				};
			} catch (error) {
				console.error("Error updating token description:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	fastify.post("/tokens/:chain/:chainId/:mint/claim", async (request, reply) => {
		try {
			const user = request.authUser;

			if (!user?.evm && !user?.solana) {
				return reply.code(401).send({
					success: false,
					error: "Authentication required",
				});
			}

			const ownerAddress = user.evm || user.solana;
			if (!ownerAddress) {
				return reply.code(401).send({
					success: false,
					error: "Valid wallet address required",
				});
			}

			const { mint, chain, chainId } = request.params as TokenRouteParams;
			const tokenData = await DB.Token.findOne({
				contractAddress: mint,
				chain,
				chainId,
			}).lean();

			if (!tokenData) {
				return reply.code(404).send({
					success: false,
					error: "Token not found",
				});
			}

			if (!tokenData.creator || tokenData.creator !== ownerAddress) {
				return reply.code(403).send({
					success: false,
					error: "Creator wallet does not match token creator",
				});
			}

			const userData = await DB.User.findOne({ address: ownerAddress }).lean();
			if (!userData?._id) {
				return reply.code(404).send({
					success: false,
					error: "User not found",
				});
			}

			if (
				tokenData.ownerClaimStatus === "claimed" &&
				tokenData.creatorUserId &&
				String(tokenData.creatorUserId) !== String(userData._id)
			) {
				return reply.code(400).send({
					success: false,
					error: "Token is already claimed by another user",
				});
			}

			await DB.Token.updateOne(
				{
					contractAddress: mint,
					chain,
					chainId,
				},
				{
					$set: {
						ownerClaimStatus: "claimed",
						creatorUserId: userData._id,
					},
				},
			);

			return {
				success: true,
				message: "Token claimed",
			};
		} catch (error) {
			console.error("Error claiming token:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// Get owner's tokens (owner only)
	fastify.get("/tokens", async (request, reply) => {
		try {
			const user = request.authUser;

			if (!user?.evm && !user?.solana) {
				return reply.code(401).send({
					success: false,
					error: "Authentication required",
				});
			}

			const ownerAddress = user.evm || user.solana;
			if (!ownerAddress) {
				return reply.code(401).send({
					success: false,
					error: "Valid wallet address required",
				});
			}

			const queryParams = request.query as {
				page?: string;
				limit?: string;
			};

			const page = Number.parseInt(queryParams.page || "1");
			const limit = Number.parseInt(queryParams.limit || "20");
			const skip = (page - 1) * limit;

			const tokens = await DB.Token.find({ creator: ownerAddress })
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.lean();

			const total = await DB.Token.countDocuments({ creator: ownerAddress });
			const totalPages = Math.ceil(total / limit);

			return {
				success: true,
				tokens,
				page,
				totalPages,
				total,
				hasMore: page < totalPages,
			};
		} catch (error) {
			console.error("Error getting owner tokens:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});
}
