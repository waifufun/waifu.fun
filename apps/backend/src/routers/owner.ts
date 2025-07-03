import type { FastifyInstance } from "fastify";
import type { TChain, TChainId } from "@autofun/types";
import DB from "@autofun/database";
import { requireTokenOwner } from "../middlewares/token-owner";
import { modifyFile, extractObjectKeyFromUrl } from "@autofun/s3-uploader";

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
				if (twitter !== undefined) updateData["socials.twitter"] = twitter;
				if (telegram !== undefined) updateData["socials.telegram"] = telegram;
				if (discord !== undefined) updateData["socials.discord"] = discord;
				if (website !== undefined) updateData["socials.website"] = website;
				if (farcaster !== undefined) updateData["socials.farcaster"] = farcaster;

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
							createdOn: "https://auto.fun/",
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
							createdOn: "https://auto.fun/",
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
