import { fal } from "@fal-ai/client";
import { falApiKey } from "@autofun/constants";

fal.config({
	credentials: falApiKey,
});

type LlmModel = "anthropic/claude-3.5-sonnet" | "anthropic/claude-3-5-haiku" | "anthropic/claude-3-haiku" | "google/gemini-pro-1.5" | "google/gemini-flash-1.5" | "google/gemini-flash-1.5-8b" | "meta-llama/llama-3.2-1b-instruct" | "meta-llama/llama-3.2-3b-instruct" | "meta-llama/llama-3.1-8b-instruct" | "meta-llama/llama-3.1-70b-instruct" | "openai/gpt-4o-mini" | "openai/gpt-4o" | "deepseek/deepseek-r1";

export class AI {
	private imageModel: string;
	private textModel: LlmModel;
	private audioModel: string;
	private videoModel: string;

	constructor({
		textModel,
		imageModel,
		audioModel,
		videoModel,
	}: { textModel: LlmModel; imageModel: string; audioModel: string; videoModel: string }) {
		this.textModel = textModel;
		this.imageModel = imageModel;
		this.audioModel = audioModel;
		this.videoModel = videoModel;
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

	async createAudio(prompt: string): Promise<string> {
		const generation = await fal.subscribe(this.audioModel, {
			input: {
				prompt: prompt,
			},
			logs: true,
		});
		const audio = generation.data.audio.url;
		return audio;
	}

	async createVideo(prompt: string): Promise<string> {
		const result = await fal.subscribe(this.videoModel, {
			input: {
				prompt: prompt,
			},
			logs: true,
			onQueueUpdate: (update) => {
				if (update.status === "IN_PROGRESS") {
					update.logs.map((log) => log.message).forEach(console.log);
				}
			},
		});
		const videoUrl = result.data.video;
		return videoUrl;
	}
}
