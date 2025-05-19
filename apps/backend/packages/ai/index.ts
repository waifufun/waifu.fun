import { fal } from "@fal-ai/client";

fal.config({

	credentials: "",
});

export class AI {
	//   private textGenerator: TextGenerator;

	//   createText(prompt: string): Promise<string> {
	//     return this.textGenerator.generate(prompt);
	//   }

	async createImage(prompt: string): Promise<Buffer> {
		const model = "fal-ai/flux/schnell";

		const generation = await fal.subscribe(model, {
			input: {
				prompt,
				num_inference_steps: 4,
			},
			logs: true,
			onQueueUpdate: (update: any) => {
				if (update.status === "IN_PROGRESS") {
					console.log("Image generation progress:", update.logs);
				}
			},
		});

		console.log("Generation full response:", JSON.stringify(generation, null, 2));

		const imageUrl = generation?.data?.images?.[0]?.url;
		if (!imageUrl) throw new Error("Failed to generate image");

		const res = await fetch(imageUrl);
		const arrayBuffer = await res.arrayBuffer();
		return Buffer.from(arrayBuffer);
	}
}
