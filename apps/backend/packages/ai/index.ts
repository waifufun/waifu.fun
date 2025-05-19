import { fal } from "@fal-ai/client";
import {FAL_MODELS, falApiKey} from "@autofun/constants"
import type {QueueStatus} from "@fal-ai/client";

fal.config({
	credentials: falApiKey,
});

export class AI {

	async createImage(prompt: string): Promise<Buffer> {

        // for now using the free fast model, until we know more about which model we are going to use!
		const model = FAL_MODELS.fast

		const generation = await fal.subscribe(model, {
			input: {
				prompt,
				num_inference_steps: 4,
			},
			logs: true,
			onQueueUpdate: (update: QueueStatus) => {
				if (update.status === "IN_PROGRESS") {
					console.log("Image generation progress:", update.logs);
				}
			},
		});

		const imageUrl = generation?.data?.images?.[0]?.url;
		if (!imageUrl) throw new Error("Failed to generate image");

		const res = await fetch(imageUrl);
		const arrayBuffer = await res.arrayBuffer();
		return Buffer.from(arrayBuffer);
	}
}
