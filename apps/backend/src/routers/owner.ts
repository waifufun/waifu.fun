import type { FastifyInstance } from "fastify";
import type { IToken, TChain, TChainId } from "@waifufun/types";
import DB from "@waifufun/database";
import { extractObjectKeyFromUrl, modifyFile } from "@waifufun/s3-uploader";
import { requireTokenOwner } from "../middlewares/token-owner";
import { composeTokensWithRuntimeOverlay } from "../utils/tokens/runtime-overlay";
import { sanitizeSocialLink } from "../utils/tokens/sanitize-links";
import {
	claimTokenRuntimeOwnership,
	listRuntimeOwnedTokenKeys,
	upsertRuntimeRecord,
	type TokenRuntimeContext,
} from "../services/owner-runtime-control-plane";
import { miladyCloud } from "../services/milady-cloud";

type TokenRouteParams = {
	mint: string;
	chain: TChain;
	chainId: TChainId;
};

type RuntimeCharacter = {
	name?: string;
	bio?: string;
	avatar?: string;
	config?: Record<string, unknown>;
};

const VALID_BILLING_MODES = ["owner_credits", "waifu_treasury_subsidy", "hybrid"] as const;
const DEFAULT_SUSPEND_REASON = "owner requested suspension";

type BillingMode = (typeof VALID_BILLING_MODES)[number];

function getOwnedRuntimeContext(request: { tokenRuntimeContext?: TokenRuntimeContext }) {
	return request.tokenRuntimeContext || null;
}

function toIsoString(value?: Date | string | null): string | null {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	return value;
}

function getMatchedOwnerAddress(context: TokenRuntimeContext, authUser?: { evm?: string; solana?: string }) {
	return context.matchedWallet || authUser?.evm || authUser?.solana || null;
}

function buildRuntimePayload(context: TokenRuntimeContext) {
	const { runtime, token } = context;

	return {
		mint: runtime.mint,
		chain: runtime.chain,
		chainId: runtime.chainId,
		claimStatus: runtime.claimStatus,
		claimedAt: runtime.claimedAt,
		ownerWalletEvm: runtime.ownerWalletEvm,
		ownerWalletSolana: runtime.ownerWalletSolana,
		ownerWallets: runtime.ownerWallets,
		creatorWallet: runtime.creatorWallet || token.creator || null,
		cloudAgentId: runtime.cloudAgentId,
		agentStatus: runtime.runtimeStatus,
		agentLifecycleState: runtime.lifecycleState,
		billingMode: runtime.billingMode,
		infraReserveUsd: runtime.infraReserveUsd,
		characterConfig: runtime.characterConfig,
		webUiUrl: runtime.webUiUrl,
		bridgeUrl: runtime.bridgeUrl,
		lastHeartbeatAt: runtime.lastHeartbeatAt,
		suspendedReason: runtime.suspendedReason,
		lastClaimedAt: runtime.lastClaimedAt || toIsoString(token.lastClaimedAt),
		runtimeMetadata: runtime.runtimeMetadata,
		hasAgent: Boolean(runtime.cloudAgentId),
	};
}

function buildMetadataPayload(
	tokenData: IToken<TChain>,
	overrides: {
		description?: string;
		twitter?: string;
		telegram?: string;
		discord?: string;
		website?: string;
	},
) {
	return {
		name: tokenData.name || "",
		symbol: tokenData.ticker || "",
		description: overrides.description !== undefined ? overrides.description : tokenData.description || "",
		image: tokenData.image || "",
		twitter: overrides.twitter !== undefined ? overrides.twitter : tokenData.socials?.twitter || "",
		telegram: overrides.telegram !== undefined ? overrides.telegram : tokenData.socials?.telegram || "",
		website: overrides.website !== undefined ? overrides.website : tokenData.socials?.website || "",
		discord: overrides.discord !== undefined ? overrides.discord : tokenData.socials?.discord || "",
		createdOn: "https://waifu.fun/",
	};
}

async function updateTokenMetadataFile(tokenData: IToken<TChain>, metadata: Record<string, unknown>) {
	if (!tokenData.metadataUrl || tokenData.imported) {
		return;
	}

	try {
		const objectKey = extractObjectKeyFromUrl(tokenData.metadataUrl);
		const fileName = objectKey.replace("token-metadata/", "");
		const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2), "utf8");
		await modifyFile("token-metadata", fileName, metadataBuffer);
	} catch (metadataError) {
		console.error("Error updating metadata file:", metadataError);
	}
}

async function loadUpdatedToken(params: TokenRouteParams) {
	return await DB.Token.findOne({
		contractAddress: params.mint,
		chain: params.chain,
		chainId: params.chainId,
	}).lean();
}

export default async function ownerRoutes(fastify: FastifyInstance) {
	fastify.post(
		"/tokens/:chain/:chainId/:mint/social",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as TokenRouteParams;
				const { twitter, telegram, discord, website, farcaster } = request.body as {
					twitter?: string;
					telegram?: string;
					discord?: string;
					website?: string;
					farcaster?: string;
				};
				const context = getOwnedRuntimeContext(request);

				if (!context) {
					return reply.code(500).send({
						success: false,
						error: "Owner runtime context missing",
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

				await updateTokenMetadataFile(
					context.token,
					buildMetadataPayload(context.token, {
						twitter,
						telegram,
						discord,
						website,
					}),
				);

				const updatedToken = await loadUpdatedToken({ mint, chain, chainId });
				const ownerAddress = getMatchedOwnerAddress(context, request.authUser);
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

	fastify.get(
		"/tokens/:chain/:chainId/:mint/owner-info",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const context = getOwnedRuntimeContext(request);
				if (!context) {
					return reply.code(500).send({
						success: false,
						error: "Owner runtime context missing",
					});
				}

				const ownerWallets = Array.from(
					new Set([
						context.runtime.ownerWalletEvm,
						context.runtime.ownerWalletSolana,
						context.runtime.creatorWallet,
						...context.runtime.ownerWallets.evm,
						...context.runtime.ownerWallets.solana,
					].filter((wallet): wallet is string => Boolean(wallet))),
				);

				const ownerData = ownerWallets.length
					? await DB.User.findOne({
							address: { $in: ownerWallets },
						}).lean()
					: null;

				return {
					success: true,
					token: context.token,
					owner: ownerData || null,
					runtime: buildRuntimePayload(context),
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
				const context = getOwnedRuntimeContext(request);
				if (!context) {
					return reply.code(500).send({
						success: false,
						error: "Owner runtime context missing",
					});
				}

				return {
					success: true,
					runtime: buildRuntimePayload(context),
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
				const { character, billingMode, infraReserveUsd } = (request.body || {}) as {
					character?: RuntimeCharacter;
					billingMode?: string;
					infraReserveUsd?: number;
				};
				const context = getOwnedRuntimeContext(request);

				if (!context) {
					return reply.code(500).send({
						success: false,
						error: "Owner runtime context missing",
					});
				}

				if (context.runtime.runtimeStatus === "running" || context.runtime.runtimeStatus === "provisioning") {
					return reply.code(400).send({
						success: false,
						error: `Agent is already ${context.runtime.runtimeStatus}`,
					});
				}

				if (context.runtime.cloudAgentId) {
					return reply.code(400).send({
						success: false,
						error: "Agent already provisioned for this token",
					});
				}

				if (billingMode !== undefined && !VALID_BILLING_MODES.includes(billingMode as BillingMode)) {
					return reply.code(400).send({
						success: false,
						error: "Invalid billing mode",
					});
				}

				if (infraReserveUsd !== undefined && (!Number.isFinite(infraReserveUsd) || infraReserveUsd < 0)) {
					return reply.code(400).send({
						success: false,
						error: "infraReserveUsd must be a non-negative number",
					});
				}

				const claimedContext = await claimTokenRuntimeOwnership({ mint, chain, chainId }, request.authUser);
				if (!claimedContext) {
					return reply.code(404).send({
						success: false,
						error: "Token not found",
					});
				}

				const selectedBillingMode = (billingMode ?? claimedContext.runtime.billingMode ?? "owner_credits") as BillingMode;
				const selectedCharacter = {
					name: character?.name || claimedContext.token.name,
					bio: character?.bio || claimedContext.token.description || undefined,
					avatar: character?.avatar || claimedContext.token.image,
					config: character?.config ?? claimedContext.runtime.characterConfig ?? undefined,
				};

				const provisionedAgent = await miladyCloud.provisionAgent({
					tokenContractAddress: mint,
					chain,
					chainId: Number(chainId),
					tokenName: claimedContext.token.name,
					tokenTicker: claimedContext.token.ticker,
					launchType: claimedContext.token.imported ? "imported" : "native",
					character: selectedCharacter,
					billing: {
						mode: selectedBillingMode,
						initialReserveUsd: infraReserveUsd ?? claimedContext.runtime.infraReserveUsd ?? undefined,
					},
				});

				const updatedRuntime = await upsertRuntimeRecord({
					mint,
					chain,
					chainId,
					claimStatus: claimedContext.runtime.claimStatus,
					claimedAt: claimedContext.runtime.claimedAt,
					creatorWallet: claimedContext.runtime.creatorWallet || claimedContext.token.creator || null,
					cloudAgentId: provisionedAgent.cloudAgentId,
					runtimeStatus: provisionedAgent.status,
					lifecycleState: provisionedAgent.status,
					billingMode: selectedBillingMode,
					infraReserveUsd: infraReserveUsd ?? claimedContext.runtime.infraReserveUsd ?? null,
					characterConfig: selectedCharacter.config || null,
					suspendedReason: null,
					runtimeMetadata: {
						lastProvisionJobId: provisionedAgent.jobId,
						lastProvisionedBy: getMatchedOwnerAddress(claimedContext, request.authUser),
					},
				});

				return {
					success: true,
					message: "Agent provisioning requested",
					agentStatus: updatedRuntime.runtimeStatus,
					runtime: buildRuntimePayload({
						...claimedContext,
						runtime: updatedRuntime,
					}),
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
				const { reason } = (request.body || {}) as { reason?: string };
				const context = getOwnedRuntimeContext(request);

				if (!context) {
					return reply.code(500).send({
						success: false,
						error: "Owner runtime context missing",
					});
				}

				if (!context.runtime.cloudAgentId) {
					return reply.code(400).send({
						success: false,
						error: "No agent exists for this token",
					});
				}

				if (context.runtime.runtimeStatus !== "running") {
					return reply.code(400).send({
						success: false,
						error: "Agent must be running to suspend",
					});
				}

				const suspendReason = reason?.trim() || DEFAULT_SUSPEND_REASON;
				await miladyCloud.suspendAgent(context.runtime.cloudAgentId, suspendReason);

				const updatedRuntime = await upsertRuntimeRecord({
					mint,
					chain,
					chainId,
					runtimeStatus: "suspended",
					lifecycleState: "suspended",
					suspendedReason: suspendReason,
				});

				return {
					success: true,
					message: "Agent suspended",
					runtime: buildRuntimePayload({
						...context,
						runtime: updatedRuntime,
					}),
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
				const context = getOwnedRuntimeContext(request);

				if (!context) {
					return reply.code(500).send({
						success: false,
						error: "Owner runtime context missing",
					});
				}

				if (!context.runtime.cloudAgentId) {
					return reply.code(400).send({
						success: false,
						error: "No agent exists for this token",
					});
				}

				if (context.runtime.runtimeStatus !== "suspended") {
					return reply.code(400).send({
						success: false,
						error: "Agent must be suspended to resume",
					});
				}

				const resumeResult = await miladyCloud.resumeAgent(context.runtime.cloudAgentId);
				const updatedRuntime = await upsertRuntimeRecord({
					mint,
					chain,
					chainId,
					runtimeStatus: resumeResult.status,
					lifecycleState: resumeResult.status,
					suspendedReason: null,
				});

				return {
					success: true,
					message: "Agent resume requested",
					runtime: buildRuntimePayload({
						...context,
						runtime: updatedRuntime,
					}),
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
				const context = getOwnedRuntimeContext(request);
				if (!context) {
					return reply.code(500).send({
						success: false,
						error: "Owner runtime context missing",
					});
				}

				let estimatedDailyBurn = 0;
				let currentPeriodCostUsd: number | null = null;
				let fundingSource: string | null = null;

				if (context.runtime.cloudAgentId) {
					try {
						const usage = await miladyCloud.getAgentUsage(context.runtime.cloudAgentId);
						estimatedDailyBurn = usage.estimatedDailyBurnUsd;
						currentPeriodCostUsd = usage.currentPeriodCostUsd;
						fundingSource = usage.fundingSource;
					} catch (usageError) {
						console.warn("Failed to fetch milady-cloud billing usage:", usageError);
					}
				}

				return {
					success: true,
					billingMode: context.runtime.billingMode,
					infraReserveUsd: context.runtime.infraReserveUsd,
					agentStatus: context.runtime.runtimeStatus,
					estimatedDailyBurn,
					currentPeriodCostUsd,
					fundingSource,
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

	fastify.post(
		"/tokens/:chain/:chainId/:mint/description",
		{
			preHandler: requireTokenOwner,
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as TokenRouteParams;
				const { description } = request.body as { description: string };
				const context = getOwnedRuntimeContext(request);

				if (!context) {
					return reply.code(500).send({
						success: false,
						error: "Owner runtime context missing",
					});
				}

				if (!description || description.length > 1000) {
					return reply.code(400).send({
						success: false,
						error: "Description is required and must be less than 1000 characters",
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

				await updateTokenMetadataFile(
					context.token,
					buildMetadataPayload(context.token, {
						description,
					}),
				);

				const updatedToken = await loadUpdatedToken({ mint, chain, chainId });
				const ownerAddress = getMatchedOwnerAddress(context, request.authUser);
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

			const { mint, chain, chainId } = request.params as TokenRouteParams;

			let claimedContext: TokenRuntimeContext | null;
			try {
				claimedContext = await claimTokenRuntimeOwnership({ mint, chain, chainId }, user);
			} catch (error) {
				return reply.code(403).send({
					success: false,
					error: error instanceof Error ? error.message : "Failed to claim token",
				});
			}

			if (!claimedContext) {
				return reply.code(404).send({
					success: false,
					error: "Token not found",
				});
			}

			return {
				success: true,
				message: "Token claimed",
				runtime: buildRuntimePayload(claimedContext),
			};
		} catch (error) {
			console.error("Error claiming token:", error);
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	fastify.get("/tokens", async (request, reply) => {
		try {
			const user = request.authUser;

			if (!user?.evm && !user?.solana) {
				return reply.code(401).send({
					success: false,
					error: "Authentication required",
				});
			}

			const queryParams = request.query as {
				page?: string;
				limit?: string;
			};

			const page = Math.max(1, Number.parseInt(queryParams.page || "1", 10));
			const limit = Math.min(100, Math.max(1, Number.parseInt(queryParams.limit || "20", 10)));
			const skip = (page - 1) * limit;
			const ownedTokenKeys = await listRuntimeOwnedTokenKeys(user);

			if (ownedTokenKeys.length === 0) {
				return {
					success: true,
					tokens: [],
					page,
					totalPages: 0,
					total: 0,
					hasMore: false,
				};
			}

			const tokenQuery = {
				$or: ownedTokenKeys.map((token) => ({
					contractAddress: token.mint,
					chain: token.chain,
					chainId: Number(token.chainId),
				})),
			};

			const [tokens, total] = await Promise.all([
				DB.Token.find(tokenQuery).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
				DB.Token.countDocuments(tokenQuery),
			]);
			const overlaidTokens = await composeTokensWithRuntimeOverlay(tokens);
			const totalPages = Math.ceil(total / limit);

			return {
				success: true,
				tokens: overlaidTokens,
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
