import type { AddressLike, TURLLike } from "@autofun/types";
import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import { uploadBase64Image } from "@autofun/s3-uploader";

import { getChecksummedAddress } from "@autofun/utils";
import { calculateStreak } from "../utils/points";
import logger from "@autofun/logger";
import redis from "@autofun/redis";

export default async function userRoutes(fastify: FastifyInstance) {
	fastify.post<{
		Body: {
			address: AddressLike;
			image?: string;
		};
		Reply: { success: boolean; imageUrl?: string; error?: string };
	}>("/upload-profile-image", async (request, reply) => {
		const { image, address } = request.body;

		if (!address) {
			throw new Error("Address is missing");
		}

		const checksummedAddress = getChecksummedAddress(address, "solana");

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
		);

		return { success: true };
	});

	fastify.post<{
		Body: { address: string };
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

		try {
			const cacheKey = `address-points:${address}`;

			const cache = await redis.get(cacheKey);
			if (cache) {
				logger.info("Returning cached points data");
				return JSON.parse(cache);
			}

			const now = new Date();
			const day = now.getUTCDay(); // 0 = Sunday
			const diffToMonday = (day === 0 ? -6 : 1) - day;
			const currentWeekStart = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday, 0, 0, 0, 0),
			);

			const MAXIMUM_WEEKLY_POINTS_AMOUNT = 1_000_000;
			const WEEKLY_POINTS_CAP = MAXIMUM_WEEKLY_POINTS_AMOUNT * 0.02;

			// 1. Global weekly points
			const [globalStats] = await DB.Event.aggregate([
				{
					$match: {
						eventType: "swap",
						swapAmount: { $exists: true },
						direction: { $in: [0, 1] },
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

			const globalWeeklyPoints = globalStats?.globalWeeklyPoints || 0;
			const multiplier = globalWeeklyPoints > 0 ? MAXIMUM_WEEKLY_POINTS_AMOUNT / globalWeeklyPoints : 0;

			// 2. User total and weekly points
			const [userResults] = await DB.Event.aggregate([
				{
					$match: {
						eventType: "swap",
						user: address,
						swapAmount: { $exists: true },
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
					},
				},
			]);

			// 2. Calculate streak points based on trading days in current week
			// Query distinct days user traded in current week
			const tradedDaysResult = await DB.Event.aggregate([
				{
					$match: {
						eventType: "swap",
						user: address,
						createdAt: { $gte: currentWeekStart },
					},
				},
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
			]);

			const tradedDays = tradedDaysResult.map((d) => d._id);
			const { streakPoints } = calculateStreak(tradedDays);

			const totalPoints = userResults?.totalPoints?.[0]?.totalPoints || 0;
			const rawWeeklyPoints = userResults?.weeklyPoints?.[0]?.weeklyPoints || 0;

			const weeklyPointsUncapped = rawWeeklyPoints * multiplier;

			const combinedWeeklyPoints = Math.min(weeklyPointsUncapped + streakPoints, WEEKLY_POINTS_CAP);

			await redis.setex(cacheKey, 120, JSON.stringify({ totalPoints, weeklyPoints: combinedWeeklyPoints }));

			return reply.send({
				success: true,
				totalPoints,
				weeklyPoints: combinedWeeklyPoints,
			});
		} catch (err) {
			console.error(err);
			return reply.code(500).send({ success: false, error: "Internal server error" });
		}
	});
}
