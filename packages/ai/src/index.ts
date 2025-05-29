import { fal } from "@fal-ai/client";
import { falApiKey } from "@autofun/constants";

fal.config({
	credentials: falApiKey,
});

type LlmModel =
	| "anthropic/claude-3.5-sonnet"
	| "anthropic/claude-3-5-haiku"
	| "anthropic/claude-3-haiku"
	| "google/gemini-pro-1.5"
	| "google/gemini-flash-1.5"
	| "google/gemini-flash-1.5-8b"
	| "meta-llama/llama-3.2-1b-instruct"
	| "meta-llama/llama-3.2-3b-instruct"
	| "meta-llama/llama-3.1-8b-instruct"
	| "meta-llama/llama-3.1-70b-instruct"
	| "openai/gpt-4o-mini"
	| "openai/gpt-4o"
	| "deepseek/deepseek-r1";

interface ImageGenerationParams {
	prompt: string;
	negative_prompt?: string;
	num_inference_steps?: number;
	guidance_scale?: number;
	width?: number;
	height?: number;
	image_size?: string;
}

interface VideoGenerationParams {
	prompt: string;
	negative_prompt?: string;
	guidance_scale?: number;
	width?: number;
	height?: number;
	image_url?: string;
}

interface AudioGenerationParams {
	lyrics: string;
	reference_audio_url?: string;
	style_prompt?: string;
	music_duration?: string;
	cfg_strength?: number;
	scheduler?: string;
	num_inference_steps?: number;
}

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

	async createImage(params: ImageGenerationParams): Promise<Buffer> {
		const input = {
			prompt: params.prompt,
			negative_prompt: params.negative_prompt,
			guidance_scale: params.guidance_scale || 7.5,
			num_inference_steps: params.num_inference_steps || 4,
			width: params.width || 1024,
			height: params.height || 1024,
			image_size: params.image_size || "square_hd",
		};

		const generation = await fal.subscribe(this.imageModel, {
			input,
			logs: true,
			onQueueUpdate: (status: { status: string; logs?: unknown }) => {
				if (status.status === "IN_PROGRESS") {
					console.log("Image generation progress:", status.logs);
				}
			},
		});

		const imageUrl = generation?.data?.images?.[0]?.url;
		if (!imageUrl) throw new Error("Failed to generate image");

		const res = await fetch(imageUrl);
		if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
		const arrayBuffer = await res.arrayBuffer();
		return Buffer.from(arrayBuffer);
	}

	async createImageUrl(params: ImageGenerationParams): Promise<string> {
		const input = {
			prompt: params.prompt,
			negative_prompt: params.negative_prompt,
			guidance_scale: params.guidance_scale || 7.5,
			num_inference_steps: params.num_inference_steps || 4,
			width: params.width || 1024,
			height: params.height || 1024,
			image_size: params.image_size || "square_hd",
		};

		const generation = await fal.subscribe(this.imageModel, {
			input,
			logs: true,
			onQueueUpdate: (status: { status: string; logs?: unknown }) => {
				if (status.status === "IN_PROGRESS") {
					console.log("Image generation progress:", status.logs);
				}
			},
		});

		const imageUrl = generation?.data?.images?.[0]?.url;
		if (!imageUrl) throw new Error("Failed to generate image");
		return imageUrl;
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

	async createAudio(params: AudioGenerationParams): Promise<string> {
		const input = {
			lyrics: params.lyrics,
			reference_audio_url:
				params.reference_audio_url || "https://storage.googleapis.com/falserverless/model_tests/diffrythm/rock_en.wav",
			style_prompt: params.style_prompt,
			music_duration: params.music_duration || "95s",
			cfg_strength: params.cfg_strength || 4,
			scheduler: params.scheduler || "euler",
			num_inference_steps: params.num_inference_steps || 32,
		};

		const generation = await fal.subscribe(this.audioModel, {
			input,
			logs: true,
			onQueueUpdate: (status: { status: string; logs?: unknown }) => {
				if (status.status === "IN_PROGRESS") {
					console.log("Music generation progress:", status.logs);
				}
			},
		});

		const audioUrl = generation.data.audio.url;
		if (!audioUrl) throw new Error("No audio URL in response");
		return audioUrl;
	}

	async createVideo(params: VideoGenerationParams): Promise<string> {
		const model = params.image_url
			? this.videoModel.includes("fast")
				? "fal-ai/pixverse/v4/image-to-video/fast"
				: "fal-ai/pixverse/v4/image-to-video"
			: this.videoModel;

		const input = {
			prompt: params.prompt,
			negative_prompt: params.negative_prompt,
			guidance_scale: params.guidance_scale || 7.5,
			...(params.width ? { width: params.width } : {}),
			...(params.height ? { height: params.height } : {}),
			...(params.image_url ? { image_url: params.image_url } : {}),
		};

		const result = await fal.subscribe(model, {
			input,
			logs: true,
			onQueueUpdate: (update) => {
				if (update.status === "IN_PROGRESS") {
					update.logs.map((log) => log.message).forEach(console.log);
				}
			},
		});

		const videoUrl = result.data.video;
		if (!videoUrl) throw new Error("No video URL in response");
		return videoUrl;
	}
}
