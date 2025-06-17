import type { AddressLike, TURLLike } from "@autofun/types";
import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import { uploadBase64Image } from "@autofun/s3-uploader";

import { getChecksummedAddress } from "@autofun/utils";

export default async function userRoutes(fastify: FastifyInstance) {
	fastify.post<{ Body: { address: AddressLike } }>("/get-user", async (request, reply) => {
		const { address } = request.body;

		if (!address) throw new Error("No address was passed");
		const user = await DB.User.findOne({ address: getChecksummedAddress(address, "solana") }).lean();
		if (!user) throw new Error("User not found");
		return user;
	});

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
}
