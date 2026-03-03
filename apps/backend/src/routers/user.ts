import type { AddressLike, TURLLike } from "@waifufun/types";
import type { FastifyInstance } from "fastify";
import DB from "@waifufun/database";
import { uploadBase64Image } from "@waifufun/s3-uploader";
import { getChecksummedAddress, isSupportedAddress, updateCryptoPrices } from "@waifufun/utils";
import { calculateStreak } from "../utils/points";
import redis from "@waifufun/redis";
import moment from "moment";

export default async function userRoutes(fastify: FastifyInstance) {
	fastify.post<{
		Body: {
			image?: string;
		};
		Reply: { success: boolean; imageUrl?: string; error?: string };
	}>("/upload-profile-image", async (request, reply) => {
		const { image } = request.body;
		const user = request.authUser;
		const address = request.authUser?.solana;

		if (!isSupportedAddress(address as AddressLike)) {
			throw new Error("Address is missing or not supported");
		}

		const checksummedAddress = getChecksummedAddress(address as AddressLike, "solana");

		if (user?.solana !== checksummedAddress) {
			return reply.code(401).send({
				success: false,
				error: "You are not authorized to update this profile",
			});
		}

		let uploadedUrl: TURLLike | false;

		if (image) {
			uploadedUrl = await uploadBase64Image(image, checksummedAddress, "avatar-images", 150, 150);
		} else {
			throw new Error("No image provided");
		}

		if (!uploadedUrl) {
			throw new Error("Image upload failed");
		}

		await DB.User.updateOne(
			{
				address: checksummedAddress,
			},
			{
				$set: {
					avatar: uploadedUrl,
				},
			},
			{
				upsert: true,
			},
		);

		return { success: true };
	});

	fastify.post<{
		Body: { address: AddressLike };
		Reply: {
			success: boolean;
			totalPoints?: number;
			weeklyPoints?: number;
			error?: string;
		};
	}>("/get-address-points", async (request, reply) => {
		const { address } = request.body;

		if (!address) throw new Error("No address was passed");
		if (!isSupportedAddress(address as AddressLike)) throw new Error("Unsupported address");

		try {
			const cryptoPrices = await updateCryptoPrices({});
			if (!cryptoPrices?.solana) throw new Error("Failed to fetch Solana price");

			const cacheKey = `address-points:${address}`;
			const cache = await redis.get(cacheKey);
			if (cache) {
				return JSON.parse(cache);
			}
			const currentWeekStart = moment().startOf("week").toDate();
			const cacheKeyGlobalStats = "globalStatsKey";
			const cacheGlobalStats = await redis.get(cacheKeyGlobalStats);

			let globalStats = undefined;
			if (cacheGlobalStats) {
				globalStats = JSON.parse(cacheGlobalStats);
			}

			if (!globalStats) {
				const [data] = await DB.Event.aggregate([
					{
						$match: {
							eventType: "swap",
							createdAt: { $gte: currentWeekStart },
						},
					},
					{ $addFields: { solPrice: { $literal: cryptoPrices?.solana } } },
					{
						$addFields: {
							usdVolume: {
								$cond: [
									{ $eq: ["$direction", 0] },
									{ $multiply: [{ $divide: [{ $toDouble: "$swapAmount" }, 1_000_000_000] }, "$solPrice"] },
									{ $multiply: [{ $divide: [{ $toDouble: "$amountGotten" }, 1_000_000_000] }, "$solPrice"] },
								],
							},
						},
					},
					{
						$addFields: {
							points: {
								$cond: [
									{ $eq: ["$direction", 0] },
									{ $multiply: ["$usdVolume", 0.6] },
									{ $multiply: ["$usdVolume", 0.1] },
								],
							},
						},
					},
					{
						$group: {
							_id: null,
							globalWeeklyPoints: { $sum: "$points" },
						},
					},
				]);

				globalStats = data || { globalWeeklyPoints: 0 };
				await redis.setex(cacheKeyGlobalStats, 60, JSON.stringify(globalStats));
			}

			const globalWeeklyPoints = globalStats.globalWeeklyPoints;

			const [userData] = await DB.Event.aggregate([
				{
					$match: {
						eventType: "swap",
						user: getChecksummedAddress(address as AddressLike, "solana"),
						direction: { $in: [0, 1] },
					},
				},
				{ $addFields: { solPrice: { $literal: cryptoPrices?.solana } } },
				{
					$addFields: {
						usdVolume: {
							$cond: [
								{ $eq: ["$direction", 0] },
								{ $multiply: [{ $divide: [{ $toDouble: "$swapAmount" }, 1_000_000_000] }, "$solPrice"] },
								{ $multiply: [{ $divide: [{ $toDouble: "$amountGotten" }, 1_000_000_000] }, "$solPrice"] },
							],
						},
					},
				},
				{
					$addFields: {
						points: {
							$cond: [
								{ $eq: ["$direction", 0] },
								{ $multiply: ["$usdVolume", 0.6] },
								{ $multiply: ["$usdVolume", 0.1] },
							],
						},
					},
				},
				{
					$facet: {
						totalPoints: [
							{ $match: { createdAt: { $lt: currentWeekStart } } },
							{ $group: { _id: null, totalPoints: { $sum: "$points" } } },
						],
						weeklyPoints: [
							{ $match: { createdAt: { $gte: currentWeekStart } } },
							{ $group: { _id: null, weeklyPoints: { $sum: "$points" } } },
						],
						tradedDays: [
							{ $match: { createdAt: { $gte: currentWeekStart } } },
							{
								$project: {
									dayString: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
								},
							},
							{ $group: { _id: "$dayString" } },
							{ $sort: { _id: 1 } },
						],
					},
				},
			]);

			const tradedDays = userData.tradedDays.map((d: { _id: string }) => d._id);
			const { streakPoints } = calculateStreak(tradedDays);

			const registrationBonus = 50;
			const totalPoints = (userData?.totalPoints?.[0]?.totalPoints || 0) + registrationBonus;
			const rawWeeklyPoints = userData?.weeklyPoints?.[0]?.weeklyPoints || 0;
			const weeklyPointsUncapped = rawWeeklyPoints + streakPoints;

			const now = moment();
			const isEndOfWeek = now.isoWeekday() === 7;
			const weeklyCap = globalWeeklyPoints * 0.02;
			const weeklyPoints = isEndOfWeek ? Math.min(weeklyPointsUncapped, weeklyCap) : weeklyPointsUncapped;

			await redis.setex(cacheKey, 120, JSON.stringify({ totalPoints, weeklyPoints }));
			return {
				success: true,
				totalPoints,
				weeklyPoints,
			};
		} catch (err) {
			console.error(err);
			return reply.code(500).send({ success: false, error: "Internal server error" });
		}
	});

	fastify.post("/get-swaps", async (request, reply) => {
		const body = request.body as {
			address: AddressLike;
			page?: number;
			limit?: number;
		};

		const { address, page = 1, limit } = body;

		if (!address) {
			throw new Error("No address was passed");
		}

		if (!isSupportedAddress(address as AddressLike)) {
			throw new Error("Unsupported address");
		}

		const cacheKey = `${address}:swaps:page=${page}:limit=${limit}`;
		const cache = await redis.get(cacheKey);

		if (cache) {
			return JSON.parse(cache);
		}

		const paginationOptions = {
			page,
			lean: true,
			limit: limit ? (limit > 50 ? 50 : limit) : 50,
			leanWithId: false,
			sort: "-createdAt",
		};

		const checksummedAddress = getChecksummedAddress(address, "solana");

		const result = await DB.Event.paginate({ eventType: "swap", user: checksummedAddress }, paginationOptions);

		const txContractAddresses = [
			...new Set(result.docs.map((tx) => getChecksummedAddress(tx.contractAddress as AddressLike, "solana"))),
		];

		const tokensForTx = await DB.Token.find({
			contractAddress: { $in: txContractAddresses },
		}).lean();

		const tokenMap = new Map(
			tokensForTx.map((token) => [getChecksummedAddress(token.contractAddress as AddressLike, "solana"), token]),
		);

		const populatedDocs = result.docs.map((tx) => {
			const normalizedAddress = getChecksummedAddress(tx.contractAddress as AddressLike, "solana");
			const tokenInfo = tokenMap.get(normalizedAddress);

			return {
				...tx,
				tokenName: tokenInfo?.name,
				verified: tokenInfo?.verified,
				image: tokenInfo?.image,
				tokenTicker: tokenInfo?.ticker,
			};
		});

		const response = {
			...result,
			docs: populatedDocs,
		};

		await redis.setex(cacheKey, 60, JSON.stringify(response));

		return reply.send(response);
	});

	fastify.post<{
		Body: {
			address: AddressLike;
			page?: number;
			limit?: number;
		};
	}>("/get-tokens-created", async (request) => {
		const { address, page = 1, limit = 10 } = request.body;

		if (!address) {
			throw new Error("No address was passed");
		}

		if (!isSupportedAddress(address as AddressLike)) {
			throw new Error("Unsupported address");
		}

		const paginationOptions = {
			page,
			limit,
			sort: "-createdAt",
		};

		const paginatedTokens = await DB.Token.paginate(
			{ creator: getChecksummedAddress(address, "solana") },
			paginationOptions,
		);

		return paginatedTokens;
	});
}
