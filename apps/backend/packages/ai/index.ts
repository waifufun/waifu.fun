import { fal } from "@fal-ai/client";
import { falApiKey } from "@autofun/constants";

fal.config({
	credentials: falApiKey,
});

export class AI {
	private model: string;
	constructor(model: string) {
		this.model = model;
	}
	async createImage(prompt: string): Promise<Buffer> {
		const generation = await fal.subscribe(this.model, {
			input: {
				prompt,
				num_inference_steps: 4,
			},
			logs: true,
		});
		const imageUrl = generation?.data?.images?.[0]?.url;
		if (!imageUrl) throw new Error("Failed to generate image");

		const res = await fetch(imageUrl);
		if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
		const arrayBuffer = await res.arrayBuffer();
		return Buffer.from(arrayBuffer);
	}

	async createText() {}
}
