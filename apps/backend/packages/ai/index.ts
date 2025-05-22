import { fal } from "@fal-ai/client";
import { falApiKey } from "@autofun/constants";

fal.config({
	credentials: falApiKey,
});

export class AI {
	private imageModel: string;
	private textModel: string;

	constructor({ textModel, imageModel }: { textModel: string; imageModel: string }) {
		this.textModel = textModel;
		this.imageModel = imageModel;
	}
	async createImage(prompt: string): Promise<Buffer> {
		const generation = await fal.subscribe(this.imageModel, {
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

	async createText(prompt?: string): Promise<string> {
		const generation = await fal.subscribe("fal-ai/any-llm", {
			input: {
				model: this.textModel,
				prompt: prompt ? prompt : "Generate a creative, detailed prompt for an AI image generation model",
			},
			logs: true,
		});
		const text = generation?.data;
		if (!text) throw new Error("Failed to generate text");
		return text?.output;
	}
}
