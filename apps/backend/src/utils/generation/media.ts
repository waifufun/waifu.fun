import type { MediaType } from "@waifufun/types";
import { AI } from "@waifufun/ai";
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

	// console.log("Starting media generation with params:", {
	// 	type: data.type,
	// 	mode,
	// 	prompt: data.prompt,
	// 	width: data.width,
	// 	height: data.height,
	// 	guidance_scale: data.guidance_scale,
	// 	negative_prompt: data.negative_prompt,
	// });

	const ai = new AI({
		textModel: "google/gemini-flash-1.5",
		imageModel: mode === "pro" ? "fal-ai/flux-pro/v1.1-ultra" : "fal-ai/flux/schnell",
		audioModel: "fal-ai/mmaudio-v2/text-to-audio",
		videoModel: mode === "pro" ? "fal-ai/pixverse/v4/text-to-video" : "fal-ai/pixverse/v4/text-to-video/fast",
	});

	const timeoutPromise = new Promise((_, reject) =>
		setTimeout(() => reject(new Error(`Media generation timed out after ${timeout}ms`)), timeout),
	);

	try {
		const mediaType = data.type.toLowerCase();
		switch (mediaType) {
			case "image": {
				const imageUrl = await Promise.race([
					ai.createImageUrl({
						prompt: data.prompt,
						negative_prompt: data.negative_prompt,
						num_inference_steps: data.num_inference_steps,
						guidance_scale: data.guidance_scale,
						width: data.width,
						height: data.height,
						image_size: "square_hd",
					}),
					timeoutPromise,
				]);
				return {
					data: {
						images: [{ url: imageUrl }],
					},
				};
			}
			case "video": {
				const videoUrl = await Promise.race([
					ai.createVideo({
						prompt: data.prompt,
						negative_prompt: data.negative_prompt,
						guidance_scale: data.guidance_scale,
						width: data.width,
						height: data.height,
						image_url: data.image_url,
					}),
					timeoutPromise,
				]);
				return {
					data: {
						video: { url: videoUrl },
					},
				};
			}
			case "audio": {
				try {
					const stylePrompt = await generateStylePrompt(data.prompt);
					let lyricsToUse = data.lyrics;

					// If no lyrics provided, generate them
					if (!lyricsToUse) {
						// Handle different prompt formats more gracefully
						const promptParts = data.prompt.split(":");
						const tokenData = {
							name: promptParts[0]?.trim() || "Unknown Token",
							symbol: promptParts[1]?.trim() || "TOKEN",
							description: promptParts[2]?.trim() || data.prompt,
						};

						lyricsToUse = await generateLyrics(tokenData, data.style_prompt || stylePrompt);
					}

					// Fallback lyrics if generation fails
					if (!lyricsToUse || lyricsToUse.trim() === "") {
						lyricsToUse = `Verse about ${data.prompt}
			This is a song about innovation
			Building the future with determination
			Together we rise, together we grow`;
					}

					const formattedLyrics = formatLyricsForDiffrhythm(lyricsToUse);

					const audioUrl = await Promise.race([
						ai.createAudio({
							lyrics: formattedLyrics,
							reference_audio_url: data.reference_audio_url,
							style_prompt: data.style_prompt || stylePrompt,
							music_duration: data.music_duration || "30",
							cfg_strength: data.cfg_strength || 0.7,
							scheduler: data.scheduler || "euler_discrete",
							num_inference_steps: data.num_inference_steps || 50,
						}),
						timeoutPromise,
					]);

					return {
						data: {
							audio: {
								url: audioUrl,
								lyrics: lyricsToUse,
							},
						},
					};
				} catch (error) {
					console.error("Audio generation error:", error);
					throw new Error(`Audio generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
				}
			}
			default:
				throw new Error(`Unsupported media type: ${data.type}`);
		}
	} catch (error) {
		console.error("Error generating media:", error);
		console.log(error);
		throw error;
	}
}
