import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import DB from "@autofun/database";
import type {
	AddressLike,
	TChain,
	TChainId,
	IPresale,
	CreatePresaleBody,
	// TURLLike,
} from "@autofun/types";
import { authenticationMiddleware } from "../middlewares/authentication";
import { requireAdminRole } from "../middlewares/admin";
import { /*upload,*/ uploadBase64Image } from "@autofun/s3-uploader";
import { getChecksummedAddress, isChainIdAllowedForChain, isSupportedAddress } from "@autofun/utils";
import redis from "@autofun/redis";
import type { MongooseBaseQueryOptions, PaginateOptions } from "mongoose";
import logger from "@autofun/logger";
import { isAdmin as isAdminFn } from "../utils/admin";

// Types for presale request body
// type PresaleAllocations = IPresale["allocations"];
// type PresaleUtility = IPresale["utility"];
type PresaleRoadmap = IPresale["roadmap"];
// type PresaleTeam = IPresale["team"];
// type PresaleSocials = IPresale["socials"];
// type PresaleKYC = IPresale["kyc"];
// type PresaleAudit = IPresale["audit"];
// type PresaleSettings = IPresale["settings"];

type AdminQueryParams = {
	page?: number;
	limit?: number;
	status?: "draft" | "active" | "paused" | "completed" | "cancelled" | "failed";
	search?: string;
};

async function authOnlyMiddleware(request: FastifyRequest, reply: FastifyReply) {
	await authenticationMiddleware(request, reply);

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	if (!(request as any).authUser?.evm && !(request as any).authUser?.solana) {
		return reply.code(401).send({
			success: false,
			error: "Authentication required",
		});
	}
}

type DemoPresaleRaise = {
	targetAmount: number;
	targetAmountUsd: number;
	minimumRaise: number;
	minimumRaiseUsd: number;
	maximumRaise: number;
	maximumRaiseUsd: number;
	raisedAmount: number;
	raisedAmountUsd: number;
	softCap: number;
	softCapUsd: number;
	hardCap: number;
	hardCapUsd: number;
	pricePerToken: number;
	pricePerTokenUsd: number;
	targetMarketcap: number;
	targetMarketcapUsd: number;
	currency: "SOL";
};

type DemoPresaleStats = {
	totalParticipants: number;
	totalInvested: number;
	totalInvestedUsd: number;
	averageInvestment: number;
	averageInvestmentUsd: number;
	largestInvestment: number;
	largestInvestmentUsd: number;
	smallestInvestment: number;
	smallestInvestmentUsd: number;
	completionPercentage: number;
};

export default async function presaleRoutes(fastify: FastifyInstance) {
	fastify.get<{
		Querystring: {
			page?: number;
			limit?: number;
			search?: string;
			status?: "draft" | "active" | "paused" | "completed" | "cancelled" | "failed";
			chain?: TChain;
			chainId?: TChainId;
			category?: "featured" | "new" | "ending-soon" | "trending";
		};
		Reply: { presales: IPresale[]; totalDocs: number; totalPages: number; page: number; limit: number };
	}>("/", async (request) => {
		try {
			const queryParams = request.query;

			const page = queryParams?.page || 1;
			const limit = queryParams?.limit || 20;
			const status = queryParams?.status;
			const chain = queryParams?.chain;
			const chainId = queryParams?.chainId;
			const category = queryParams?.category || "new";
			const search = queryParams?.search;

			const cacheKey = `presales:${page}:${limit}:${status}:${chain}:${chainId}:${category}:${search || "no-search"}`;
			const cache = await redis.get(cacheKey);

			if (cache) {
				return JSON.parse(cache);
			}

			const query: MongooseBaseQueryOptions = {
				hidden: { $ne: true },
			};

			if (status) {
				query.status = status;
			}

			if (chain && chainId) {
				const allowedChain = isChainIdAllowedForChain(chain, chainId);
				if (!allowedChain) throw new Error("Unsupported chain pair");
				query.chain = chain;
				query.chainId = chainId;
			}

			if (search) {
				query.$text = { $search: search };
			}

			let sortQuery = "-createdAt";
			switch (category) {
				case "featured":
					sortQuery = "-featured -createdAt";
					query.featured = true;
					break;
				case "ending-soon":
					sortQuery = "schedule.endDate";
					query.status = "active";
					break;
				case "trending":
					sortQuery = "-stats.totalParticipants -createdAt";
					break;
				default: // "new"
					sortQuery = "-createdAt";
					break;
			}

			const paginationOptions: PaginateOptions = {
				page,
				lean: true,
				limit: limit > 50 ? 50 : limit,
				select: "-__v",
				leanWithId: false,
				sort: sortQuery,
			};

			const presalesPaginated = await DB.Presale.paginate(query, paginationOptions);

			const returnData = {
				presales: presalesPaginated.docs,
				totalDocs: presalesPaginated.totalDocs,
				totalPages: presalesPaginated.totalPages,
				page: presalesPaginated.page,
				limit: presalesPaginated.limit,
			};

			await redis.setex(cacheKey, 30, JSON.stringify(returnData));

			return returnData;
		} catch (error) {
			logger.error({ err: error }, "Error in presales route");
			throw error;
		}
	});

	fastify.get<{
		Params: { id: string };
		Reply: IPresale;
	}>("/:id", async (request) => {
		try {
			const { id } = request.params;

			const cacheKey = `presale:${id}`;
			const cache = await redis.get(cacheKey);

			if (cache) {
				return JSON.parse(cache);
			}

			const presale = await DB.Presale.findOne({
				_id: id,
				hidden: { $ne: true },
			}).lean();

			if (!presale) {
				throw new Error("Presale not found");
			}

			await redis.setex(cacheKey, 60, JSON.stringify(presale));

			return presale;
		} catch (error) {
			logger.error({ err: error }, "Error in single presale route");
			throw error;
		}
	});

	fastify.get<{
		Params: {
			chain: TChain;
			chainId: TChainId;
			contractAddress: AddressLike;
		};
		Reply: IPresale;
	}>("/:chain/:chainId/:contractAddress", async (request) => {
		try {
			const { chain, chainId, contractAddress } = request.params;

			const isAllowed = isSupportedAddress(contractAddress);
			if (!isAllowed) throw new Error("Unsupported address");

			const isAllowedChainPair = isChainIdAllowedForChain(chain, chainId);
			if (!isAllowedChainPair) throw new Error("Unsupported chain/chainId value");

			const checksummedContractAddress =
				chain === "evm"
					? getChecksummedAddress(contractAddress, "evm")
					: getChecksummedAddress(contractAddress, "solana");
			const cacheKey = `presale:${chain}:${chainId}:${checksummedContractAddress}`;
			const cache = await redis.get(cacheKey);

			if (cache) {
				return JSON.parse(cache);
			}

			const presale = await DB.Presale.findOne({
				contractAddress: checksummedContractAddress,
				chain,
				chainId,
				hidden: { $ne: true },
			}).lean();

			if (!presale) {
				throw new Error("Presale not found");
			}

			await redis.setex(cacheKey, 60, JSON.stringify(presale));

			return presale;
		} catch (error) {
			logger.error({ err: error }, "Error in presale by mint route");
			throw error;
		}
	});

	// Create a new presale (admin only)
	fastify.post<{
		Body: CreatePresaleBody;
		Reply: { success: boolean; presale?: IPresale; error?: string };
	}>(
		"/admin/create",
		{
			preHandler: requireAdminRole("admin"),
		},
		async (request, reply) => {
			try {
				const user = request.authUser;
				const creator = user?.evm || user?.solana;

				if (!creator) {
					return reply.code(401).send({
						success: false,
						error: "Authentication required",
					});
				}

				const presaleData = request.body;

				const { creator: presaleCreator } = presaleData;
				if (!presaleCreator || !isSupportedAddress(presaleCreator)) {
					return reply.code(400).send({
						success: false,
						error: "Invalid or missing creator address",
					});
				}

				const isAllowedChainPair = isChainIdAllowedForChain(presaleData.chain, presaleData.chainId);
				if (!isAllowedChainPair) {
					return reply.code(400).send({
						success: false,
						error: "Unsupported chain/chainId combination",
					});
				}

				const isAllowed = isSupportedAddress(presaleData.contractAddress);
				if (!isAllowed) {
					return reply.code(400).send({
						success: false,
						error: "Unsupported mint address",
					});
				}

				const existingPresale = await DB.Presale.findOne({
					contractAddress: presaleData.contractAddress,
					chain: presaleData.chain,
					chainId: presaleData.chainId,
				});

				if (existingPresale) {
					return reply.code(409).send({
						success: false,
						error: "Presale already exists for this token",
					});
				}

				let imageUrl: string | undefined;
				if (presaleData.image) {
					try {
						const uploadResult = await uploadBase64Image(presaleData.image, presaleData.name, "presales");
						if (!uploadResult) {
							throw new Error("Upload failed");
						}
						imageUrl = uploadResult;
					} catch (error) {
						logger.error("Failed to upload image:", error);
						return reply.code(400).send({
							success: false,
							error: "Failed to upload image",
						});
					}
				}

				const newPresale = new DB.Presale({
					...presaleData,
					creator:
						presaleData.chain === "evm"
							? getChecksummedAddress(creator, "evm")
							: getChecksummedAddress(creator, "solana"),
					contractAddress:
						presaleData.chain === "evm"
							? getChecksummedAddress(presaleData.contractAddress, "evm")
							: getChecksummedAddress(presaleData.contractAddress, "solana"),
					image: imageUrl || "https://auto.fun/default-presale-image.png",
					status: "draft",
					schedule: {
						...presaleData.schedule,
						startDate: new Date(presaleData.schedule.startDate),
						endDate: new Date(presaleData.schedule.endDate),
						claimDate: presaleData.schedule.claimDate ? new Date(presaleData.schedule.claimDate) : undefined,
					},
					roadmap: {
						phases: presaleData.roadmap.phases.map((phase: PresaleRoadmap["phases"][0]) => ({
							...phase,
							estimatedDate: new Date(phase.estimatedDate),
							completed: false,
						})),
					},
					stats: {
						totalParticipants: 0,
						totalInvested: 0,
						totalInvestedUsd: 0,
						averageInvestment: 0,
						averageInvestmentUsd: 0,
						largestInvestment: 0,
						largestInvestmentUsd: 0,
						smallestInvestment: 0,
						smallestInvestmentUsd: 0,
						completionPercentage: 0,
					},
					participants: [],
					totalSupply: 1000000000,
				});

				await newPresale.save();

				await redis.del("presales:*");

				return {
					success: true,
					presale: newPresale,
				};
			} catch (error) {
				logger.error({ err: error }, "Error creating presale");
				return reply.code(500).send({
					success: false,
					error: "Failed to create presale",
				});
			}
		},
	);

	// Update presale (creator or admin)
	fastify.put<{
		Params: { id: string };
		Body: Partial<CreatePresaleBody>;
		Reply: { success: boolean; presale?: IPresale; error?: string };
	}>(
		"/:id",
		{
			preHandler: authOnlyMiddleware,
		},
		async (request, reply) => {
			try {
				const user = request.authUser;
				const userAddress = user?.evm || user?.solana;

				if (!userAddress) {
					return reply.code(401).send({
						success: false,
						error: "Authentication required",
					});
				}

				const { id } = request.params;
				const updateData = request.body;

				const presale = await DB.Presale.findById(id);
				if (!presale) {
					return reply.code(404).send({
						success: false,
						error: "Presale not found",
					});
				}

				const isAdmin = await isAdminFn(userAddress);
				if (
					!isAdmin &&
					presale.creator !==
						(presale.chain === "evm"
							? getChecksummedAddress(userAddress, "evm")
							: getChecksummedAddress(userAddress, "solana"))
				) {
					return reply.code(403).send({
						success: false,
						error: "Only the creator or an admin can update this presale",
					});
				}

				if (presale.status !== "draft") {
					return reply.code(400).send({
						success: false,
						error: "Can only update presales in draft status",
					});
				}

				if (updateData.image?.startsWith("data:")) {
					try {
						const uploadResult = await uploadBase64Image(updateData.image, presale.name, "presales");
						if (!uploadResult) {
							throw new Error("Upload failed");
						}
						updateData.image = uploadResult;
					} catch (error) {
						logger.error("Failed to upload image:", error);
						return reply.code(400).send({
							success: false,
							error: "Failed to upload image",
						});
					}
				}

				const updatedPresale = await DB.Presale.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

				if (!updatedPresale) {
					return reply.code(404).send({
						success: false,
						error: "Presale not found after update",
					});
				}

				await redis.del(`presale:${id}`);
				await redis.del("presales:*");

				return {
					success: true,
					presale: updatedPresale,
				};
			} catch (error) {
				logger.error({ err: error }, "Error updating presale");
				return reply.code(500).send({
					success: false,
					error: "Failed to update presale",
				});
			}
		},
	);

	// Participate in presale
	fastify.post<{
		Params: { id: string };
		Body: { amount: number; signature?: string };
		Reply: { success: boolean; error?: string };
	}>(
		"/:id/participate",
		{
			preHandler: authOnlyMiddleware,
		},
		async (request, reply) => {
			try {
				const user = request.authUser;
				const userAddress = user?.evm || user?.solana;

				if (!userAddress) {
					return reply.code(401).send({
						success: false,
						error: "Authentication required",
					});
				}

				const { id } = request.params;
				const { amount, signature } = request.body;

				const presale = await DB.Presale.findById(id);
				if (!presale) {
					return reply.code(404).send({
						success: false,
						error: "Presale not found",
					});
				}

				if (presale.status !== "active") {
					return reply.code(400).send({
						success: false,
						error: "Presale is not active",
					});
				}

				const now = new Date();
				if (now < presale.schedule.startDate || now > presale.schedule.endDate) {
					return reply.code(400).send({
						success: false,
						error: "Presale is not open for participation",
					});
				}

				if (amount < presale.settings.minimumInvestment) {
					return reply.code(400).send({
						success: false,
						error: `Minimum investment is ${presale.settings.minimumInvestment}`,
					});
				}

				if (amount > presale.settings.maximumInvestment) {
					return reply.code(400).send({
						success: false,
						error: `Maximum investment is ${presale.settings.maximumInvestment}`,
					});
				}

				const existingParticipation = presale.participants.find(
					(p) =>
						p.address ===
						(presale.chain === "evm"
							? getChecksummedAddress(userAddress, "evm")
							: getChecksummedAddress(userAddress, "solana")),
				);

				if (existingParticipation) {
					return reply.code(400).send({
						success: false,
						error: "You have already participated in this presale",
					});
				}

				const tokensToReceive = amount / presale.raise.pricePerToken;

				presale.participants.push({
					address:
						presale.chain === "evm"
							? getChecksummedAddress(userAddress, "evm")
							: getChecksummedAddress(userAddress, "solana"),
					amount,
					tokens: tokensToReceive,
					participatedAt: new Date(),
					claimed: false,
					signature,
				});

				presale.stats.totalParticipants += 1;
				presale.stats.totalInvested += amount;
				presale.stats.totalInvestedUsd =
					(presale.stats.totalInvestedUsd ?? 0) + amount * (presale.raise.pricePerTokenUsd ?? 0);
				presale.stats.averageInvestment = presale.stats.totalInvested / presale.stats.totalParticipants;
				presale.stats.averageInvestmentUsd =
					presale.stats.totalParticipants > 0
						? (presale.stats.totalInvestedUsd ?? 0) / presale.stats.totalParticipants
						: 0;
				presale.stats.largestInvestment = Math.max(presale.stats.largestInvestment, amount);
				presale.stats.largestInvestmentUsd = Math.max(
					presale.stats.largestInvestmentUsd ?? 0,
					amount * (presale.raise.pricePerTokenUsd ?? 0),
				);
				presale.stats.smallestInvestment =
					presale.stats.smallestInvestment === 0 ? amount : Math.min(presale.stats.smallestInvestment, amount);
				presale.stats.smallestInvestmentUsd =
					(presale.stats.smallestInvestmentUsd ?? 0) === 0
						? amount * (presale.raise.pricePerTokenUsd ?? 0)
						: Math.min(presale.stats.smallestInvestmentUsd ?? 0, amount * (presale.raise.pricePerTokenUsd ?? 0));
				presale.stats.completionPercentage = (presale.stats.totalInvested / presale.raise.targetAmount) * 100;

				presale.raise.raisedAmount += amount;
				presale.raise.raisedAmountUsd =
					(presale.raise.raisedAmountUsd ?? 0) + amount * (presale.raise.pricePerTokenUsd ?? 0);

				await presale.save();

				await redis.del(`presale:${id}`);
				await redis.del("presales:*");

				return {
					success: true,
				};
			} catch (error) {
				logger.error({ err: error }, "Error participating in presale");
				return reply.code(500).send({
					success: false,
					error: "Failed to participate in presale",
				});
			}
		},
	);

	// Refund participation in failed presale
	fastify.post<{
		Params: { id: string };
		Reply: { success: boolean; error?: string; refundAmount?: number };
	}>(
		"/:id/refund",
		{
			preHandler: authOnlyMiddleware,
		},
		async (request, reply) => {
			try {
				const user = request.authUser;
				const userAddress = user?.evm || user?.solana;

				if (!userAddress) {
					return reply.code(401).send({
						success: false,
						error: "Authentication required",
					});
				}

				const { id } = request.params;

				const presale = await DB.Presale.findById(id);
				if (!presale) {
					return reply.code(404).send({
						success: false,
						error: "Presale not found",
					});
				}

				if (presale.status !== "failed") {
					return reply.code(400).send({
						success: false,
						error: "Refunds are only available for failed presales",
					});
				}

				const checksummedUserAddress =
					presale.chain === "evm"
						? getChecksummedAddress(userAddress, "evm")
						: getChecksummedAddress(userAddress, "solana");

				const participation = presale.participants.find((p) => p.address === checksummedUserAddress);

				if (!participation) {
					return reply.code(404).send({
						success: false,
						error: "No participation found for this user",
					});
				}

				if (participation.refunded) {
					return reply.code(400).send({
						success: false,
						error: "Refund has already been processed",
					});
				}

				// Mark participation as refunded
				participation.refunded = true;
				participation.refundedAt = new Date();

				await presale.save();

				await redis.del(`presale:${id}`);
				await redis.del("presales:*");

				return {
					success: true,
					refundAmount: participation.amount,
				};
			} catch (error) {
				logger.error({ err: error }, "Error processing refund");
				return reply.code(500).send({
					success: false,
					error: "Failed to process refund",
				});
			}
		},
	);

	// Get all presales for admin
	fastify.get(
		"/admin/all",
		{
			preHandler: requireAdminRole("admin"),
		},
		async (request) => {
			try {
				const { page = 1, limit = 20, status, search } = request.query as AdminQueryParams;

				const query: MongooseBaseQueryOptions = {};
				if (status) query.status = status;
				if (search) query.$text = { $search: search };

				const paginationOptions: PaginateOptions = {
					page: Number(page),
					lean: true,
					limit: Number(limit) > 50 ? 50 : Number(limit),
					select: "-__v",
					leanWithId: false,
					sort: "-createdAt",
				};

				const presalesPaginated = await DB.Presale.paginate(query, paginationOptions);

				return {
					success: true,
					...presalesPaginated,
				};
			} catch (error) {
				logger.error({ err: error }, "Error in admin presales route");
				throw error;
			}
		},
	);

	// Update presale status (admin only)
	fastify.patch<{
		Params: { id: string };
		Body: { status: "draft" | "active" | "paused" | "completed" | "cancelled" | "failed" };
		Reply: { success: boolean; error?: string };
	}>(
		"/admin/:id/status",
		{
			preHandler: requireAdminRole("admin"),
		},
		async (request, reply) => {
			try {
				const { id } = request.params;
				const { status } = request.body;

				const presale = await DB.Presale.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });

				if (!presale) {
					return reply.code(404).send({
						success: false,
						error: "Presale not found",
					});
				}
				await redis.del(`presale:${id}`);
				await redis.del("presales:*");

				return {
					success: true,
				};
			} catch (error) {
				logger.error({ err: error }, "Error updating presale status");
				return reply.code(500).send({
					success: false,
					error: "Failed to update presale status",
				});
			}
		},
	);

	// Toggle presale featured status (admin only)
	fastify.patch<{
		Params: { id: string };
		Body: { featured: boolean };
		Reply: { success: boolean; error?: string };
	}>(
		"/admin/:id/featured",
		{
			preHandler: requireAdminRole("admin"),
		},
		async (request, reply) => {
			try {
				const { id } = request.params;
				const { featured } = request.body;

				const presale = await DB.Presale.findByIdAndUpdate(id, { featured }, { new: true });

				if (!presale) {
					return reply.code(404).send({
						success: false,
						error: "Presale not found",
					});
				}
				await redis.del(`presale:${id}`);
				await redis.del("presales:*");

				return {
					success: true,
				};
			} catch (error) {
				logger.error({ err: error }, "Error toggling presale featured status");
				return reply.code(500).send({
					success: false,
					error: "Failed to toggle featured status",
				});
			}
		},
	);

	// Toggle presale verification (admin only)
	fastify.patch<{
		Params: { id: string };
		Body: { verified: boolean };
		Reply: { success: boolean; error?: string };
	}>(
		"/admin/:id/verify",
		{
			preHandler: requireAdminRole("admin"),
		},
		async (request, reply) => {
			try {
				const { id } = request.params;
				const { verified } = request.body;

				const presale = await DB.Presale.findByIdAndUpdate(id, { verified }, { new: true });

				if (!presale) {
					return reply.code(404).send({
						success: false,
						error: "Presale not found",
					});
				}
				await redis.del(`presale:${id}`);
				await redis.del("presales:*");

				return {
					success: true,
				};
			} catch (error) {
				logger.error({ err: error }, "Error toggling presale verification");
				return reply.code(500).send({
					success: false,
					error: "Failed to toggle verification",
				});
			}
		},
	);

	// Delete presale (admin only)
	fastify.delete<{
		Params: { id: string };
		Reply: { success: boolean; error?: string };
	}>(
		"/admin/:id",
		{
			preHandler: requireAdminRole("admin"),
		},
		async (request, reply) => {
			try {
				const { id } = request.params;

				const presale = await DB.Presale.findByIdAndDelete(id);

				if (!presale) {
					return reply.code(404).send({
						success: false,
						error: "Presale not found",
					});
				}
				await redis.del(`presale:${id}`);
				await redis.del("presales:*");

				return {
					success: true,
				};
			} catch (error) {
				logger.error({ err: error }, "Error deleting presale");
				return reply.code(500).send({
					success: false,
					error: "Failed to delete presale",
				});
			}
		},
	);

	// Temporary: Demo presales endpoint for frontend/testing
	fastify.get<{ Reply: IPresale[] }>("/demo", async (_request, _reply) => {
		return [
			{
				_id: "demo1",
				contractAddress: "4Nd1mYwqQw7vQ2Qw7vQ2Qw7vQw7vQ2Qw7vQ2Qw7vQ2" as AddressLike,
				chain: "solana",
				chainId: 101,
				name: "Vitaliks Sigma",
				symbol: "VITAL",
				image: "https://v3.fal.media/files/penguin/6K13rtTummk2LE8MlQ83r.png",
				description:
					"Join the exclusive club of crypto insiders with Vitalik's Sigma.  Unleash your inner sigma grindset and conquer the defiverse.  Memes, insights, and maybe some lambos?",
				totalSupply: 1000000000,
				decimals: 9,
				creator: "4Nd1mYwqQw7vQ2Qw7vQ2Qw7vQw7vQ2Qw7vQ2Qw7vQ2" as AddressLike,
				status: "draft",
				tokenomics: {
					presaleAllocation: 50,
					liquidityAllocation: 30,
					teamAllocation: 20,
					marketingAllocation: 0,
					developmentAllocation: 0,
					communityAllocation: 0,
				},
				raise: {
					targetAmount: 10000,
					targetAmountUsd: 1500000,
					minimumRaise: 1000,
					minimumRaiseUsd: 150000,
					maximumRaise: 20000,
					maximumRaiseUsd: 3000000,
					raisedAmount: 0,
					raisedAmountUsd: 0,
					softCap: 1000,
					softCapUsd: 150000,
					hardCap: 20000,
					hardCapUsd: 3000000,
					pricePerToken: 0.01,
					pricePerTokenUsd: 0.15,
					targetMarketcap: 1000000000 * 0.01,
					targetMarketcapUsd: 1000000000 * 0.15,
					currency: "SOL",
				} as DemoPresaleRaise,
				schedule: {
					startDate: new Date(),
					endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
				},
				allocations: {
					presale: { percentage: 50, amount: 500000, price: 0.01 },
					liquidity: { percentage: 30, amount: 300000, lockDuration: 90 },
				},
				utility: {
					description: "AI-powered trading automation.",
					features: ["Auto-trade", "AI signals"],
					useCases: ["Trading"],
					benefits: ["Passive income"],
				},
				roadmap: { phases: [] },
				team: { members: [], description: "AI Bot Team" },
				socials: {},
				kyc: { completed: false },
				audit: { completed: false },
				participants: [],
				settings: {
					minimumInvestment: 5,
					maximumInvestment: 25,
					refundable: false,
					whitelistRequired: false,
					kycRequired: false,
					vestingEnabled: false,
				},
				stats: {
					totalParticipants: 0,
					totalInvested: 0,
					totalInvestedUsd: 0,
					averageInvestment: 0,
					averageInvestmentUsd: 0,
					largestInvestment: 0,
					largestInvestmentUsd: 0,
					smallestInvestment: 0,
					smallestInvestmentUsd: 0,
					completionPercentage: 0,
				} as DemoPresaleStats,
				hidden: false,
				featured: false,
				verified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				_id: "demo2",
				contractAddress: "7Gg1mYwqQw7vQ2Qw7vQ2Qw7vQw7vQ2Qw7vQ2Qw7vQ2" as AddressLike,
				chain: "solana",
				chainId: 101,
				name: "PokiFitHodl",
				symbol: "POKI",
				image: "https://v3.fal.media/files/penguin/ezI9yAsj3WUVXpB36mExj.png",
				description:
					"Sweat, hodl, repeat!  PokiFitHodl merges the fitness craze with crypto's chill vibes.  Meme-worthy gains await the dedicated.  LFG!",
				totalSupply: 1000000000,
				decimals: 9,
				creator: "7Gg1mYwqQw7vQ2Qw7vQ2Qw7vQw7vQ2Qw7vQ2Qw7vQ2" as AddressLike,
				status: "active",
				tokenomics: {
					presaleAllocation: 20,
					liquidityAllocation: 15,
					teamAllocation: 10,
					marketingAllocation: 5,
					developmentAllocation: 10,
					communityAllocation: 0,
				},
				raise: {
					targetAmount: 1500,
					targetAmountUsd: 225000,
					minimumRaise: 5,
					minimumRaiseUsd: 750,
					maximumRaise: 20,
					maximumRaiseUsd: 3000,
					raisedAmount: 600,
					raisedAmountUsd: 90000,
					softCap: 500,
					softCapUsd: 75000,
					hardCap: 2000,
					hardCapUsd: 300000,
					pricePerToken: 0.0000075,
					pricePerTokenUsd: 0.001125,
					targetMarketcap: 1000000000 * 0.0000075,
					targetMarketcapUsd: 1000000000 * 0.001125,
					currency: "SOL",
				},
				schedule: {
					startDate: new Date(),
					endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
				},
				allocations: {
					presale: { percentage: 20, amount: 200000000, price: 0.0000075 },
					liquidity: { percentage: 15, amount: 500000, lockDuration: 180 },
				},
				utility: {
					description: "AI-secured asset vault.",
					features: ["AI security", "Vault"],
					useCases: ["Asset storage"],
					benefits: ["Safety"],
				},
				roadmap: { phases: [] },
				team: { members: [], description: "AI Vault Team" },
				socials: {},
				kyc: { completed: false },
				audit: { completed: false },
				participants: [],
				settings: {
					minimumInvestment: 5,
					maximumInvestment: 25,
					refundable: false,
					whitelistRequired: false,
					kycRequired: false,
					vestingEnabled: false,
				},
				stats: {
					totalParticipants: 45,
					totalInvested: 600,
					totalInvestedUsd: 90000,
					averageInvestment: 13.33,
					averageInvestmentUsd: 1999.5,
					largestInvestment: 50,
					largestInvestmentUsd: 7500,
					smallestInvestment: 5,
					smallestInvestmentUsd: 750,
					completionPercentage: 40,
				} as DemoPresaleStats,
				hidden: false,
				featured: false,
				verified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				_id: "demo3",
				contractAddress: "9Hh2mYwqQw7vQ2Qw7vQ2Qw7vQw7vQ2Qw7vQ2Qw7vQ2" as AddressLike,
				chain: "solana",
				chainId: 101,
				name: "SaucyAcad",
				symbol: "SACA",
				image: "https://v3.fal.media/files/penguin/RjSBL16ac4tkWBJwUfk85.png",
				description:
					"Dive into the chaotic intersection of light academia and sassy internet culture.  Think tweed jackets, questionable life choices, and meme-worthy moments.  Join the revolution!",
				totalSupply: 1000000000,
				decimals: 9,
				creator: "9Hh2mYwqQw7vQ2Qw7vQ2Qw7vQw7vQ2Qw7vQ2Qw7vQ2" as AddressLike,
				status: "paused",
				tokenomics: {
					presaleAllocation: 55,
					liquidityAllocation: 30,
					teamAllocation: 10,
					marketingAllocation: 5,
					developmentAllocation: 0,
					communityAllocation: 0,
				},
				raise: {
					targetAmount: 15000,
					targetAmountUsd: 225000,
					minimumRaise: 1500,
					minimumRaiseUsd: 225000,
					maximumRaise: 30000,
					maximumRaiseUsd: 450000,
					raisedAmount: 0,
					raisedAmountUsd: 0,
					softCap: 1500,
					softCapUsd: 225000,
					hardCap: 30000,
					hardCapUsd: 450000,
					pricePerToken: 0.015,
					pricePerTokenUsd: 0.225,
					targetMarketcap: 1000000000 * 0.015,
					targetMarketcapUsd: 1000000000 * 0.225,
					currency: "SOL",
				} as DemoPresaleRaise,
				schedule: {
					startDate: new Date(),
					endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
				},
				allocations: {
					presale: { percentage: 55, amount: 825000, price: 0.015 },
					liquidity: { percentage: 30, amount: 450000, lockDuration: 120 },
				},
				utility: {
					description: "AI-powered content generation.",
					features: ["AI text", "AI image"],
					useCases: ["Content creation"],
					benefits: ["Productivity"],
				},
				roadmap: { phases: [] },
				team: { members: [], description: "AI Gen Team" },
				socials: {},
				kyc: { completed: false },
				audit: { completed: false },
				participants: [],
				settings: {
					minimumInvestment: 5,
					maximumInvestment: 25,
					refundable: false,
					whitelistRequired: false,
					kycRequired: false,
					vestingEnabled: false,
				},
				stats: {
					totalParticipants: 0,
					totalInvested: 0,
					totalInvestedUsd: 0,
					averageInvestment: 0,
					averageInvestmentUsd: 0,
					largestInvestment: 0,
					largestInvestmentUsd: 0,
					smallestInvestment: 0,
					smallestInvestmentUsd: 0,
					completionPercentage: 0,
				} as DemoPresaleStats,
				hidden: false,
				featured: false,
				verified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		] as IPresale[];
	});
}
