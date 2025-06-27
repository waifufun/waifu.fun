import type { AddressLike, TURLLike } from "@autofun/types";
import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import { uploadBase64Image } from "@autofun/s3-uploader";
import { getChecksummedAddress, isSupportedAddress } from "@autofun/utils";
import { calculateStreak } from "../utils/points";
import redis from "@autofun/redis";
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

		if (!address) {
			throw new Error("No address was passed");
		}

		if (!isSupportedAddress(address as AddressLike)) {
			throw new Error("Unsupported address");
		}

		try {
			const cacheKey = `address-points:${address}`;

			const cache = await redis.get(cacheKey);
			if (cache) {
				return JSON.parse(cache);
			}

			const currentWeekStart = moment().startOf("week").toDate();

			const MAXIMUM_WEEKLY_POINTS_AMOUNT = 1_000_000;
			const WEEKLY_POINTS_CAP = MAXIMUM_WEEKLY_POINTS_AMOUNT * 0.02;

			const cacheKeyGlobalStats = "globalStatsKey";
			const cacheGlobalStats = await redis.get(cacheKeyGlobalStats);

			let globalStats = undefined;

			if (cacheGlobalStats) {
				globalStats = JSON.parse(cacheGlobalStats);
			}

			if (!globalStats) {
				const data = await DB.Event.aggregate([
					{
						$match: {
							eventType: "swap",
							createdAt: { $gte: currentWeekStart },
						},
					},
					{
						$addFields: {
							points: {
								$cond: [
									{ $eq: ["$direction", 0] },
									{ $multiply: [{ $toDouble: "$swapAmount" }, 0.6] },
									{ $multiply: [{ $toDouble: "$swapAmount" }, 0.1] },
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

				globalStats = data?.[0];

				await redis.setex(cacheKeyGlobalStats, 60, JSON.stringify(globalStats));
			}

			const globalWeeklyPoints = globalStats?.globalWeeklyPoints || 0;
			const multiplier = globalWeeklyPoints > 0 ? MAXIMUM_WEEKLY_POINTS_AMOUNT / globalWeeklyPoints : 0;

			// 2. User total and weekly points, and trading streak
			const [userData] = await DB.Event.aggregate([
				{
					$match: {
						eventType: "swap",
						user: getChecksummedAddress(address as AddressLike, "solana"),
						direction: { $in: [0, 1] },
					},
				},
				{
					$addFields: {
						points: {
							$cond: [
								{ $eq: ["$direction", 0] },
								{ $multiply: [{ $toDouble: "$swapAmount" }, 0.6] },
								{ $multiply: [{ $toDouble: "$swapAmount" }, 0.1] },
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
									dayString: {
										$dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
									},
								},
							},
							{
								$group: {
									_id: "$dayString",
								},
							},
							{
								$sort: { _id: 1 },
							},
						],
					},
				},
			]);

			const tradedDays = userData.tradedDays.map((d: { _id: string }) => d._id);
			const { streakPoints } = calculateStreak(tradedDays);

			// + 50 represents the points you get on wallet connect
			const totalPoints = (userData?.totalPoints?.[0]?.totalPoints || 0) + 50;
			const rawWeeklyPoints = userData?.weeklyPoints?.[0]?.weeklyPoints || 0;
			const weeklyPointsUncapped = rawWeeklyPoints * multiplier;
			const combinedWeeklyPoints = Math.min(weeklyPointsUncapped + streakPoints, WEEKLY_POINTS_CAP);

			await redis.setex(cacheKey, 120, JSON.stringify({ totalPoints, weeklyPoints: combinedWeeklyPoints }));

			return {
				success: true,
				totalPoints,
				weeklyPoints: combinedWeeklyPoints,
			};
		} catch (err) {
			console.error(err);
			return reply.code(500).send({ success: false, error: "Internal server error" });
		}
	});
}
