import type { FastifyInstance } from "fastify";
import type { AddressLike, TChain, TChainId } from "@waifufun/types";
import DB from "@waifufun/database";
import { requireAdminRole, requirePermission } from "../middlewares/admin";
import { getAdminInfo } from "../utils/admin";
import { getAdminTokens, getAdminTokenStats } from "../utils/admin/token-queries";
import { modifyFile, extractObjectKeyFromUrl } from "@waifufun/s3-uploader";
import { authenticationMiddleware } from "../middlewares/authentication";
import { launchGateService } from "../services/launch-gate";

import type { FastifyRequest, FastifyReply } from "fastify";

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

export default async function adminRoutes(fastify: FastifyInstance) {
	// Get current user's admin status
	fastify.get(
		"/status",
		{
			preHandler: authOnlyMiddleware,
		},
		async (request, reply) => {
			const user = request.authUser;

			if (!user?.evm && !user?.solana) {
				return reply.code(401).send({
					success: false,
					error: "Authentication required",
				});
			}

			const address = user.evm || user.solana;

			if (!address) {
				return reply.code(401).send({
					success: false,
					error: "Valid wallet address required",
				});
			}

			const adminInfo = await getAdminInfo(address);

			const isAdmin = !!adminInfo;

			return {
				success: true,
				isAdmin,
				adminInfo,
			};
		},
	);

	// Get all admins (super admin only)
	fastify.get(
		"/list",
		{
			preHandler: requireAdminRole("super_admin"),
		},
		async (_request, reply) => {
			try {
				const admins = await DB.User.find({
					adminRole: { $exists: true, $ne: null },
				})
					.select("address adminRole adminPermissions createdAt adminCreatedBy")
					.lean();

				return {
					success: true,
					admins,
				};
			} catch (error) {
				return reply.code(500).send({
					success: false,
					error: "Failed to fetch admins",
				});
			}
		},
	);

	// Add admin (super admin only)
	fastify.post(
		"/add",
		{
			preHandler: requireAdminRole("super_admin"),
		},
		async (request, reply) => {
			const { address, role, permissions } = request.body as {
				address: AddressLike;
				role: "admin" | "moderator" | "super_admin";
				permissions?: string[];
			};

			if (!address || !role) {
				return reply.code(400).send({
					success: false,
					error: "Address and role are required",
				});
			}

			if (role === "super_admin") {
				return reply.code(400).send({
					success: false,
					error: "Cannot create super_admin via API",
				});
			}

			try {
				const currentUser = request.authUser;
				const currentAddress = currentUser?.evm || currentUser?.solana;

				const existingUser = await DB.User.findOne({ address }).lean();
				if (existingUser?.adminRole) {
					return reply.code(409).send({
						success: false,
						error: "User is already an admin",
					});
				}

				await DB.User.updateOne(
					{ address },
					{
						$set: {
							adminRole: role,
							adminPermissions: permissions || [],
							adminCreatedBy: currentAddress,
						},
					},
					{ upsert: true },
				);

				return {
					success: true,
					message: "Admin added successfully",
				};
			} catch (error) {
				return reply.code(500).send({
					success: false,
					error: "Failed to add admin",
				});
			}
		},
	);

	// Remove admin (super admin only)
	fastify.delete(
		"/remove/:address",
		{
			preHandler: requireAdminRole("super_admin"),
		},
		async (request, reply) => {
			const { address } = request.params as { address: string };

			if (!address) {
				return reply.code(400).send({
					success: false,
					error: "Address is required",
				});
			}

			try {
				const user = await DB.User.findOne({ address }).lean();
				if (!user?.adminRole) {
					return reply.code(404).send({
						success: false,
						error: "User is not an admin",
					});
				}

				await DB.User.updateOne(
					{ address },
					{
						$unset: {
							adminRole: 1,
							adminPermissions: 1,
							adminCreatedBy: 1,
						},
					},
				);

				return {
					success: true,
					message: "Admin removed successfully",
				};
			} catch (error) {
				return reply.code(500).send({
					success: false,
					error: "Failed to remove admin",
				});
			}
		},
	);

	// Update admin permissions (super admin only)
	fastify.put(
		"/permissions/:address",
		{
			preHandler: requireAdminRole("super_admin"),
		},
		async (request, reply) => {
			const { address } = request.params as { address: string };
			const { permissions } = request.body as { permissions: string[] };

			if (!address || !permissions) {
				return reply.code(400).send({
					success: false,
					error: "Address and permissions are required",
				});
			}

			try {
				const user = await DB.User.findOne({ address }).lean();
				if (!user?.adminRole) {
					return reply.code(404).send({
						success: false,
						error: "User is not an admin",
					});
				}

				await DB.User.updateOne(
					{ address },
					{
						$set: {
							adminPermissions: permissions,
						},
					},
				);

				return {
					success: true,
					message: "Permissions updated successfully",
				};
			} catch (error) {
				return reply.code(500).send({
					success: false,
					error: "Failed to update permissions",
				});
			}
		},
	);

	// Verify token (requires verify_tokens permission)
	fastify.post(
		"/verify-token",
		{
			preHandler: requirePermission("verify_tokens"),
		},
		async (request, reply) => {
			const { tokenAddress, verified } = request.body as { tokenAddress: string; verified?: boolean };
			if (!tokenAddress) {
				return reply.code(400).send({ success: false, error: "Token address is required" });
			}
			try {
				await DB.Token.updateOne({ contractAddress: tokenAddress }, { $set: { verified: verified !== false } });
				return { success: true, message: `Token ${verified === false ? "unverified" : "verified"} successfully` };
			} catch (error) {
				return reply.code(500).send({ success: false, error: "Failed to update verification" });
			}
		},
	);

	// Update token social links (requires manage_tokens permission)
	fastify.post(
		"/tokens/:chain/:chainId/:mint/social",
		{
			preHandler: requirePermission("manage_tokens"),
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as { mint: string; chain: TChain; chainId: TChainId };

				if (!mint || mint.length < 32 || mint.length > 44) {
					return reply.code(400).send({
						success: false,
						error: "Invalid mint address",
					});
				}

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

				const updatedToken = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				const adminUser = request.authUser;
				const adminAddress = adminUser?.evm || adminUser?.solana;
				console.log(`Admin ${adminAddress} updated social links for token ${mint} on ${chain}:${chainId}`);

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

	// Set token featured flag (requires manage_tokens permission)
	fastify.post(
		"/tokens/:chain/:chainId/:mint/featured",
		{
			preHandler: requirePermission("manage_tokens"),
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as { mint: string; chain: TChain; chainId: TChainId };

				if (!mint || mint.length < 32 || mint.length > 44) {
					return reply.code(400).send({
						success: false,
						error: "Invalid mint address",
					});
				}

				const { featured } = request.body as { featured: boolean };

				if (featured === undefined || typeof featured !== "boolean") {
					return reply.code(400).send({
						success: false,
						error: "Featured flag must be a boolean",
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
					{ $set: { featured } },
				);

				const updatedToken = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				const adminUser = request.authUser;
				const adminAddress = adminUser?.evm || adminUser?.solana;
				console.log(`Admin ${adminAddress} set featured flag to ${featured} for token ${mint} on ${chain}:${chainId}`);

				return {
					success: true,
					message: `Token featured flag set to ${featured}`,
					token: updatedToken,
				};
			} catch (error) {
				console.error("Error setting token featured flag:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	// Set token hidden flag (requires manage_tokens permission)
	fastify.post(
		"/tokens/:chain/:chainId/:mint/hidden",
		{
			preHandler: requirePermission("manage_tokens"),
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as { mint: string; chain: TChain; chainId: TChainId };

				if (!mint || mint.length < 32 || mint.length > 44) {
					return reply.code(400).send({
						success: false,
						error: "Invalid mint address",
					});
				}

				const { hidden } = request.body as { hidden: boolean };

				if (hidden === undefined || typeof hidden !== "boolean") {
					return reply.code(400).send({
						success: false,
						error: "Hidden flag must be a boolean",
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
					{ $set: { hidden } },
				);

				const updatedToken = await DB.Token.findOne({
					contractAddress: mint,
					chain,
					chainId,
				}).lean();

				const adminUser = request.authUser;
				const adminAddress = adminUser?.evm || adminUser?.solana;
				console.log(`Admin ${adminAddress} set hidden flag to ${hidden} for token ${mint} on ${chain}:${chainId}`);

				return {
					success: true,
					message: `Token hidden flag set to ${hidden}`,
					token: updatedToken,
				};
			} catch (error) {
				console.error("Error setting token hidden flag:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	// Set user suspended flag (requires manage_users permission)
	fastify.post(
		"/users/:address/suspended",
		{
			preHandler: requirePermission("manage_users"),
		},
		async (request, reply) => {
			try {
				const { address } = request.params as { address: string };

				if (!address || address.length < 32 || address.length > 44) {
					return reply.code(400).send({
						success: false,
						error: "Invalid wallet address",
					});
				}

				const { suspended } = request.body as { suspended: boolean };

				if (suspended === undefined || typeof suspended !== "boolean") {
					return reply.code(400).send({
						success: false,
						error: "Suspended flag must be a boolean",
					});
				}

				const userData = await DB.User.findOne({ address }).lean();
				if (!userData) {
					return reply.code(404).send({
						success: false,
						error: "User not found",
					});
				}

				await DB.User.updateOne({ address }, { $set: { suspended } });

				const updatedUser = await DB.User.findOne({ address }).lean();

				const adminUser = request.authUser;
				const adminAddress = adminUser?.evm || adminUser?.solana;
				console.log(`Admin ${adminAddress} set suspended flag to ${suspended} for user ${address}`);

				return {
					success: true,
					message: `User suspended flag set to ${suspended}`,
					user: {
						...updatedUser,
						suspended: updatedUser?.suspended || false,
					},
				};
			} catch (error) {
				console.error("Error setting user suspended flag:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	// Get user by address (requires manage_users permission)
	fastify.get(
		"/users/:address",
		{
			preHandler: requirePermission("manage_users"),
		},
		async (request, _reply) => {
			try {
				const { address } = request.params as { address: string };

				if (!address || address.length < 32 || address.length > 44) {
					return {
						success: false,
						error: "Invalid wallet address",
					};
				}

				const userData = await DB.User.findOne({ address }).lean();

				if (!userData) {
					return {
						success: false,
						error: "User not found",
					};
				}

				interface UserWithDefaults {
					[key: string]: unknown;
					tokensCreated: unknown[];
					tokensHeld: unknown[];
					transactions: unknown[];
					totalVolume: number;
				}

				return {
					success: true,
					user: {
						...userData,
						tokensCreated: [],
						tokensHeld: [],
						transactions: [],
						totalVolume: 0,
					} as UserWithDefaults,
				};
			} catch (error) {
				console.error("Error getting user:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	);

	// Get admin statistics (requires view_analytics permission)
	fastify.get(
		"/stats",
		{
			preHandler: requirePermission("view_analytics"),
		},
		async (_request, reply) => {
			try {
				const userCount = await DB.User.countDocuments();

				const tokenCount = await DB.Token.countDocuments();

				const activeModeratorsCount = await DB.User.countDocuments({
					adminRole: { $in: ["admin", "moderator"] },
				});

				const tokenStatsResult = await DB.Token.aggregate([
					{
						$group: {
							_id: null,
							totalVolume: { $sum: "$volume24h" },
							verifiedCount: { $sum: { $cond: ["$verified", 1, 0] } },
							featuredCount: { $sum: { $cond: ["$featured", 1, 0] } },
							hiddenCount: { $sum: { $cond: ["$hidden", 1, 0] } },
						},
					},
				]);

				const tokenStats = tokenStatsResult[0] || {
					totalVolume: 0,
					verifiedCount: 0,
					featuredCount: 0,
					hiddenCount: 0,
				};

				return {
					success: true,
					stats: {
						userCount,
						tokenCount,
						activeModerators: activeModeratorsCount,
						volume24h: Number(tokenStats.totalVolume || 0),
						verifiedTokens: Number(tokenStats.verifiedCount || 0),
						featuredTokens: Number(tokenStats.featuredCount || 0),
						hiddenTokens: Number(tokenStats.hiddenCount || 0),
					},
				};
			} catch (error) {
				console.error("Error getting admin stats:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	// Get paginated users (requires manage_users permission)
	fastify.get(
		"/users",
		{
			preHandler: requirePermission("manage_users"),
		},
		async (request, _reply) => {
			try {
				const queryParams = request.query as {
					search?: string;
					limit?: string;
					page?: string;
					sortBy?: string;
					sortOrder?: string;
					suspended?: string;
				};

				const isSearching = !!queryParams.search;
				const limit = isSearching ? 5 : Number.parseInt(queryParams.limit || "50");
				const page = Number.parseInt(queryParams.page || "1");
				const skip = (page - 1) * limit;

				const search = queryParams.search;
				const sortBy = search ? "createdAt" : queryParams.sortBy || "createdAt";
				const sortOrder = queryParams.sortOrder || "desc";
				const showSuspended = queryParams.suspended === "true";

				const timeoutDuration = process.env.NODE_ENV === "test" ? 2000 : 5000;

				const timeoutPromise = new Promise((_, reject) =>
					setTimeout(() => reject(new Error("Database query timed out")), timeoutDuration),
				);

				const countTimeoutPromise = new Promise<number>((_, reject) =>
					setTimeout(() => reject(new Error("Count query timed out")), timeoutDuration / 2),
				);

				const buildFilters = () => {
					const filters: Record<string, unknown> = {};

					if (showSuspended) {
						filters.suspended = true;
					} else {
						filters.$or = [{ suspended: { $ne: true } }, { suspended: { $exists: false } }];
					}

					if (search) {
						filters.$or = [
							{ displayName: { $regex: search, $options: "i" } },
							{ address: { $regex: search, $options: "i" } },
						];
					}

					return filters;
				};

				const buildSort = () => {
					const sortOptions: Record<string, 1 | -1> = {};
					const validSortFields = ["createdAt", "points", "displayName", "address"];

					if (validSortFields.includes(sortBy)) {
						sortOptions[sortBy] = sortOrder.toLowerCase() === "desc" ? -1 : 1;
					} else {
						sortOptions.createdAt = -1;
					}

					return sortOptions;
				};

				const userQuery = async () => {
					try {
						const filters = buildFilters();
						const sortOptions = buildSort();

						const users = await DB.User.find(filters).sort(sortOptions).skip(skip).limit(limit).lean();

						return users;
					} catch (error) {
						console.error("Error in user query:", error);
						return [];
					}
				};

				const countPromise = async () => {
					try {
						const filters = buildFilters();
						const total = await DB.User.countDocuments(filters);
						return total;
					} catch (error) {
						console.error("Error in count query:", error);
						return 0;
					}
				};

				let usersResult: unknown[] = [];
				let total = 0;

				try {
					const [users, count] = await Promise.all([
						Promise.race([userQuery(), timeoutPromise]),
						Promise.race([countPromise(), countTimeoutPromise]),
					]);
					usersResult = users as Record<string, unknown>[];
					total = count as number;
				} catch (error) {
					console.error("User query failed or timed out:", error);
					usersResult = [];
				}

				const totalPages = Math.ceil(total / limit);

				interface UserWithDefaults {
					[key: string]: unknown;
					tokensCreated: unknown[];
					tokensHeld: unknown[];
					transactions: unknown[];
					totalVolume: number;
				}

				const usersWithDefaults = (usersResult as Record<string, unknown>[]).map(
					(user): UserWithDefaults => ({
						...user,
						tokensCreated: [],
						tokensHeld: [],
						transactions: [],
						totalVolume: 0,
					}),
				);

				return {
					success: true,
					users: usersWithDefaults,
					page,
					totalPages,
					total,
					hasMore: page < totalPages,
				};
			} catch (error) {
				console.error("Error in users route:", error);
				return {
					success: true,
					users: [],
					page: 1,
					totalPages: 0,
					total: 0,
					hasMore: false,
				};
			}
		},
	);

	// Get paginated tokens (requires manage_tokens permission)
	fastify.get(
		"/tokens",
		{
			preHandler: requirePermission("manage_tokens"),
		},
		async (request, reply) => {
			try {
				const queryParams = request.query as {
					search?: string;
					limit?: string;
					page?: string;
					sortBy?: string;
					sortOrder?: string;
					hideImported?: string;
					chain?: TChain;
					chainId?: TChainId;
				};

				const isSearching = !!queryParams.search;
				const limit = isSearching ? 5 : Number.parseInt(queryParams.limit || "50");
				const page = Number.parseInt(queryParams.page || "1");
				const hideImported = queryParams.hideImported === "1" ? 1 : undefined;
				const search = queryParams.search;
				const chain = queryParams.chain;
				const chainId = queryParams.chainId;

				let sortBy = queryParams.sortBy;
				let sortOrder = queryParams.sortOrder || "desc";

				if (sortBy === "all") {
					sortBy = "featured";
					sortOrder = "desc";
				} else if (sortBy === "oldest") {
					sortBy = "createdAt";
					sortOrder = "asc";
				} else if (!sortBy) {
					sortBy = "createdAt";
					sortOrder = "desc";
				}

				const { tokens, total } = await getAdminTokens({
					hideImported,
					search,
					sortBy,
					sortOrder,
					limit,
					page,
					chain,
					chainId,
				});

				const totalPages = Math.ceil(total / limit);

				const processedTokens = tokens.map((token) => ({
					...token,
					hidden: !!token.hidden,
					featured: !!token.featured,
					verified: !!token.verified,
					imported: !!token.imported,
				}));

				return {
					success: true,
					tokens: processedTokens,
					page,
					totalPages,
					total,
					hasMore: page < totalPages,
				};
			} catch (error) {
				console.error("Error getting admin tokens:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	// Get admin token statistics (requires view_analytics permission)
	fastify.get(
		"/tokens/stats",
		{
			preHandler: requirePermission("view_analytics"),
		},
		async (_request, reply) => {
			try {
				const stats = await getAdminTokenStats();

				return {
					success: true,
					stats,
				};
			} catch (error) {
				console.error("Error getting admin token stats:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	// Update token metadata (requires manage_tokens permission)
	fastify.post(
		"/tokens/:chain/:chainId/:mint/metadata",
		{
			preHandler: requirePermission("manage_tokens"),
		},
		async (request, reply) => {
			try {
				const { mint, chain, chainId } = request.params as { mint: string; chain: TChain; chainId: TChainId };

				if (!mint || mint.length < 32 || mint.length > 44) {
					return reply.code(400).send({
						success: false,
						error: "Invalid mint address",
					});
				}

				const updatedMetadata = request.body as Record<string, unknown>;

				if (!updatedMetadata || typeof updatedMetadata !== "object") {
					return reply.code(400).send({
						success: false,
						error: "Invalid metadata format provided",
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

				if (tokenData.imported) {
					return reply.code(403).send({
						success: false,
						error: "Cannot update metadata for imported tokens",
					});
				}

				if (!tokenData.metadataUrl) {
					return reply.code(400).send({
						success: false,
						error: "Token does not have existing metadata URL to update",
					});
				}

				const objectKey = extractObjectKeyFromUrl(tokenData.metadataUrl);
				const metadataBuffer = Buffer.from(JSON.stringify(updatedMetadata, null, 2), "utf8");

				await modifyFile("token-metadata", objectKey.replace("token-metadata/", ""), metadataBuffer);

				await DB.Token.updateOne(
					{
						contractAddress: mint,
						chain,
						chainId,
					},
					{ $set: { lastUpdated: new Date() } },
				);

				const adminUser = request.authUser;
				const adminAddress = adminUser?.evm || adminUser?.solana;
				console.log(`Admin ${adminAddress} updated metadata for token ${mint} on ${chain}:${chainId}`);

				return {
					success: true,
					message: "Token metadata updated successfully",
					metadataUrl: tokenData.metadataUrl,
				};
			} catch (error) {
				console.error("Error updating token metadata:", error);
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		},
	);

	fastify.get(
		"/launch-gate/allowlist",
		{
			preHandler: requirePermission("manage_users"),
		},
		async () => {
			return {
				success: true,
				enabled: launchGateService.isEnabled(),
				allowlist: await launchGateService.listAllowlist(),
			};
		},
	);

	fastify.post(
		"/launch-gate/allowlist",
		{
			preHandler: requirePermission("manage_users"),
		},
		async (request, reply) => {
			const { walletAddress } = request.body as { walletAddress?: string };

			if (!walletAddress) {
				return reply.code(400).send({
					success: false,
					error: "walletAddress is required",
				});
			}

			try {
				const adminAddress = request.authUser?.solana || request.authUser?.evm;
				await launchGateService.addToAllowlist(walletAddress, adminAddress);
				return {
					success: true,
					allowlist: await launchGateService.listAllowlist(),
				};
			} catch (error) {
				return reply.code(400).send({
					success: false,
					error: error instanceof Error ? error.message : "Failed to add wallet to allowlist",
				});
			}
		},
	);

	fastify.delete(
		"/launch-gate/allowlist/:wallet",
		{
			preHandler: requirePermission("manage_users"),
		},
		async (request, reply) => {
			const { wallet } = request.params as { wallet?: string };

			if (!wallet) {
				return reply.code(400).send({
					success: false,
					error: "wallet is required",
				});
			}

			try {
				await launchGateService.removeFromAllowlist(wallet);
				return {
					success: true,
					allowlist: await launchGateService.listAllowlist(),
				};
			} catch (error) {
				return reply.code(400).send({
					success: false,
					error: error instanceof Error ? error.message : "Failed to remove wallet from allowlist",
				});
			}
		},
	);

	fastify.post(
		"/launch-gate/invite",
		{
			preHandler: requirePermission("manage_users"),
		},
		async (request, reply) => {
			const { maxUses } = request.body as { maxUses?: number };
			const createdBy = request.authUser?.solana || request.authUser?.evm;

			if (!createdBy) {
				return reply.code(401).send({
					success: false,
					error: "Authentication required",
				});
			}

			if (!maxUses || maxUses < 1) {
				return reply.code(400).send({
					success: false,
					error: "maxUses must be greater than 0",
				});
			}

			try {
				const code = await launchGateService.generateInviteCode(maxUses, createdBy);
				return {
					success: true,
					code,
				};
			} catch (error) {
				return reply.code(400).send({
					success: false,
					error: error instanceof Error ? error.message : "Failed to generate invite code",
				});
			}
		},
	);

	fastify.get(
		"/launch-gate/invites",
		{
			preHandler: requirePermission("manage_users"),
		},
		async (_request, reply) => {
			try {
				const invites = await launchGateService.listInvites();
				return {
					success: true,
					invites: invites.map((invite) => ({
						...invite,
						remainingUses: Math.max(invite.maxUses - invite.usedCount, 0),
					})),
				};
			} catch (error) {
				return reply.code(500).send({
					success: false,
					error: error instanceof Error ? error.message : "Failed to list invite codes",
				});
			}
		},
	);

}
