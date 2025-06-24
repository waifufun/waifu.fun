import type { AddressLike, TURLLike } from "@autofun/types";
import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import { uploadBase64Image } from "@autofun/s3-uploader";

import { getChecksummedAddress } from "@autofun/utils";

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

	// This route returns the weekly-points, and the permanent points based on a given wallet address
	fastify.post<{
		Body: {
			address: string;
		};
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
			const user = await DB.User.findOne({ address });

			if (!user) {
				return reply.send({ success: false, error: "User not found" });
			}

			// Default fallback time (epoch or from DB)
			const lastUpdate = user.lastWeeklyUpdate || new Date(0);
			const now = new Date();

			const oneWeekLater = new Date(lastUpdate);
			oneWeekLater.setDate(oneWeekLater.getDate() + 7);

			const result = await DB.Event.aggregate([
				{
					$match: {
						eventType: "swap",
						creator: address,
					},
				},
				{
					$project: {
						swapAmount: { $toDouble: "$swapAmount" },
						blockTime: 1,
					},
				},
				{
					$addFields: {
						points: { $multiply: ["$swapAmount", 0.01] },
						eventTimeMs: { $multiply: ["$blockTime", 1000] },
					},
				},
				{
					$group: {
						_id: null,
						totalPoints: { $sum: "$points" },
						weeklyPoints: {
							$sum: {
								$cond: [{ $gte: ["$eventTimeMs", lastUpdate.getTime()] }, "$points", 0],
							},
						},
					},
				},
			]);

			const aggregation = result[0] || { totalPoints: 0, weeklyPoints: 0 };

			console.log("result from aggragation ->", result);

			// ----- Weekly rollover logic -----
			if (now >= oneWeekLater) {
				user.points += user.weekly_points;
				user.weekly_points = 0;
				user.lastWeeklyUpdate = now;
				await user.save();
			}

			// ----- Cap weekly points -----
			const weeklyCap = 1_000_000 * 0.02;
			const capped = Math.min(aggregation.weeklyPoints, weeklyCap);

			if (user.weekly_points !== capped) {
				user.weekly_points = capped;
				await user.save();
			}

			return reply.send({
				success: true,
				totalPoints: user.points,
				weeklyPoints: user.weekly_points,
			});
		} catch (err) {
			console.error(err);
			return reply.send({ success: false, error: "Internal server error" });
		}
	});
}
