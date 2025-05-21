import type { MediaType } from "@autofun/types";
import { fal } from "@fal-ai/client";
import { falApiKey } from "@autofun/constants";
import { generateLyrics, formatLyricsForDiffrhythm } from "./lyrics";
import { generateStylePrompt } from "../../prompts/style-prompt";

export async function generateMedia(data: {
	prompt: string;
	type: MediaType;
	negative_prompt?: string;
	num_inference_steps?: number;
	seed?: number;
	num_frames?: number;
	fps?: number;
	motion_bucket_id?: number;
	duration?: number;
	duration_seconds?: number;
	bpm?: number;
	guidance_scale?: number;
	width?: number;
	height?: number;
	mode?: "fast" | "pro";
	image_url?: string;
	lyrics?: string;
	reference_audio_url?: string;
	style_prompt?: string;
	music_duration?: string;
	cfg_strength?: number;
	scheduler?: string;
}) {
	const timeout = 300000;
	const defaultMode = "fast";
	const mode = data.mode || defaultMode;

	console.log("Starting media generation with params:", {
		type: data.type,
		mode,
		prompt: data.prompt,
		width: data.width,
		height: data.height,
		guidance_scale: data.guidance_scale,
		negative_prompt: data.negative_prompt,
	});

	if (!falApiKey) {
		throw new Error("FAL_API_KEY environment variable not set.");
	}
	fal.config({ credentials: falApiKey });

	const timeoutPromise = new Promise((_, reject) =>
		setTimeout(() => reject(new Error(`Media generation timed out after ${timeout}ms`)), timeout),
	);

	let generationPromise: Promise<unknown>;

	try {
		const mediaType = data.type.toLowerCase();
		switch (mediaType) {
			case "image": {
				const isProMode = mode === "pro";
				const model = isProMode ? "fal-ai/flux-pro/v1.1-ultra" : "fal-ai/flux/schnell";

				const input: {
					prompt: string;
					width?: number;
					height?: number;
					num_inference_steps?: number;
					negative_prompt?: string;
					guidance_scale?: number;
				} = {
					prompt: data.prompt,
					negative_prompt: data.negative_prompt,
					guidance_scale: data.guidance_scale,
				};

				if (isProMode) {
					if (data.width) input.width = data.width;
					if (data.height) input.height = data.height;
				} else {
					input.num_inference_steps = 4;
				}

				generationPromise = fal.subscribe(model, {
					input,
					logs: true,
					onQueueUpdate: (status: { status: string; logs?: unknown }) => {
						if (status.status === "IN_PROGRESS") {
							console.log("Image generation progress:", status.logs);
						}
					},
				});
				break;
			}
			case "video": {
				if (data.image_url) {
					const isProMode = mode === "pro";
					const model = isProMode ? "fal-ai/pixverse/v4/image-to-video" : "fal-ai/pixverse/v4/image-to-video/fast";

					generationPromise = fal.subscribe(model, {
						input: {
							prompt: data.prompt,
							image_url: data.image_url,
							negative_prompt: data.negative_prompt,
							guidance_scale: data.guidance_scale,
						},
						logs: true,
						onQueueUpdate: (status: { status: string; logs?: unknown }) => {
							if (status.status === "IN_PROGRESS") {
								console.log("Image-to-video generation progress:", status.logs);
							}
						},
					});
				} else {
					const isProMode = mode === "pro";
					const model = isProMode ? "fal-ai/pixverse/v4/text-to-video" : "fal-ai/pixverse/v4/text-to-video/fast";

					generationPromise = fal.subscribe(model, {
						input: {
							prompt: data.prompt,
							negative_prompt: data.negative_prompt,
							guidance_scale: data.guidance_scale,
							...(data.width ? { width: data.width } : {}),
							...(data.height ? { height: data.height } : {}),
						},
						logs: true,
						onQueueUpdate: (status: { status: string; logs?: unknown }) => {
							if (status.status === "IN_PROGRESS") {
								console.log("Video generation progress:", status.logs);
							}
						},
					});
				}
				break;
			}
			case "audio": {
				const isProMode = mode === "pro";
				let lyricsToUsePromise: Promise<string> | undefined;

				const stylePrompt = await generateStylePrompt(data.prompt);

				if (!data.lyrics) {
					lyricsToUsePromise = generateLyrics(
						{
							name: data.prompt.split(":")[0] || "",
							symbol: data.prompt.split(":")[1]?.trim() || "",
							description: data.prompt.split(":")[2]?.trim() || "",
						},
						data.style_prompt || stylePrompt,
					);
				}

				const lyricsToUse = await (lyricsToUsePromise || (async () => data.lyrics)());

				if (!lyricsToUse) {
					throw new Error("No lyrics found");
				}

				const formattedLyrics = formatLyricsForDiffrhythm(lyricsToUse);

				const input = {
					lyrics: formattedLyrics,
					reference_audio_url:
						data.reference_audio_url ||
						"https://storage.googleapis.com/falserverless/model_tests/diffrythm/rock_en.wav",
					style_prompt: data.style_prompt || stylePrompt,
					music_duration: data.music_duration || "95s",
					cfg_strength: data.cfg_strength || 4,
					scheduler: data.scheduler || "euler",
					num_inference_steps: data.num_inference_steps || 32,
				};

				generationPromise = fal.subscribe("fal-ai/diffrhythm", {
					input,
					logs: true,
					onQueueUpdate: (status: { status: string; logs?: unknown }) => {
						if (status.status === "IN_PROGRESS") {
							console.log("Music generation progress:", status.logs);
						}
					},
				});

				interface FalAudioResult {
					data?: {
						audio?: {
							url?: string;
						};
					};
				}

				const result = (await Promise.race([generationPromise, timeoutPromise])) as FalAudioResult;
				const audioUrl = result.data?.audio?.url;
				if (!audioUrl) {
					throw new Error("No audio URL in response");
				}

				return {
					data: {
						audio: {
							url: audioUrl,
							lyrics: lyricsToUse,
						},
					},
				};
			}
			default:
				throw new Error(`Unsupported media type: ${data.type}`);
		}

		const result = await Promise.race([generationPromise, timeoutPromise]);
		return result;
	} catch (error) {
		console.error("Error in media generation:", error);
		throw error;
	}
}
