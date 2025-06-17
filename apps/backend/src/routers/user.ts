import type { AddressLike, TURLLike } from "@autofun/types";
import type { FastifyInstance } from "fastify";
import DB from "@autofun/database";
import { uploadBase64Image } from "@autofun/s3-uploader";
import { randomUUID } from "node:crypto";

export default async function userRoutes(fastify: FastifyInstance) {
	// Get User by wallet address
	fastify.post<{ Params: { address: AddressLike }; Body: { address: string } }>(
		"/get-user",
		async (request, reply) => {
			const { address } = request.body;

			try {
				if (!address) throw new Error("No address was passed");
				const user = await DB.User.findOne({ address });

				if (!user) throw new Error("User not found");

				return reply.send(user);
			} catch (error) {
				throw new Error(`Failed to find user: ${(error as Error).message}`);
			}
		},
	);

	// Change/Create Avatar on user
	fastify.post<{
		Body: {
			address: string;
			image?: string;
		};
		Reply: { success: boolean; imageUrl?: string; error?: string };
	}>("/upload-profile-image", async (request, reply) => {
		const { image, address } = request.body;

		if (!address) {
			throw new Error("Address is missing");
		}

		try {
			const fileName = `${address}-${randomUUID()}`;
			let uploadedUrl: TURLLike | false;

			if (image) {
				uploadedUrl = await uploadBase64Image(image, fileName, "avatar-images", 40, 40);
			} else {
				throw new Error("No image provided");
			}

			if (!uploadedUrl) {
				throw new Error("Image upload failed");
			}

			await DB.User.findOneAndUpdate({ address }, { avatar: uploadedUrl });

			return reply.send({ success: true });
		} catch (error) {
			return reply.code(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error uploading profile image",
			});
		}
	});
}
