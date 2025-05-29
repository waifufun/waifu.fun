import type { FastifyInstance } from "fastify";
import { generateMetadata } from "../utils/generation/metadata";
import { generateMedia } from "../utils/generation/media";
import { MediaType } from "@autofun/types";
import { checkRateLimit, incrementRateLimit } from "../utils/generation/ratelimit";

interface GenerateMetadataRequest {
	fields?: ("name" | "symbol" | "description" | "prompt")[];
	existingData?: {
		name?: string;
		symbol?: string;
		description?: string;
		prompt?: string;
	};
	prompt?: string;
}

interface GenerateMediaRequest {
	prompt: string;
	type?: MediaType;
	negative_prompt?: string;
	guidance_scale?: number;
	width?: number;
	height?: number;
	mode?: "fast" | "pro";
}

interface GenerateBothRequest extends Omit<GenerateMediaRequest, "prompt"> {
	metadataPrompt?: string;
}

export default async function generationRoutes(fastify: FastifyInstance) {
	fastify.post<{ Body: GenerateMetadataRequest }>("/generate-metadata", async (request, reply) => {
		try {
			const metadata = await generateMetadata(request.body);

			if (!metadata) {
				return reply.code(500).send({
					success: false,
					error: "Failed to generate valid token metadata after maximum retries",
				});
			}

			return { success: true, metadata };
		} catch (error) {
			return reply.code(500).send({
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	fastify.post<{ Body: GenerateMediaRequest }>("/generate", async (request, reply) => {
		try {
			const user = request.authUser;
			if (!user?.evm && !user?.solana && process.env.NODE_ENV !== "development") {
				return reply.code(401).send({
					success: false,
					error: "User authentication required",
				});
			}

			const userPublicKey = user?.evm || user?.solana || "dev";
			const rateLimit = await checkRateLimit(userPublicKey);
			if (!rateLimit.allowed) {
				return reply.code(429).send({
					success: false,
					error: "Rate limit exceeded",
					remainingGenerations: rateLimit.remaining,
					resetTime: rateLimit.resetTime,
				});
			}

			const {
				prompt,
				type = MediaType.IMAGE,
				negative_prompt,
				guidance_scale = 7.5,
				width = 1024,
				height = 1024,
			} = request.body;

			if (!prompt || prompt.length > 2000) {
				return reply.code(400).send({
					error: "Invalid prompt length",
				});
			}

			if (width < 512 || width > 1024 || height < 512 || height > 1024) {
				return reply.code(400).send({
					error: "Invalid dimensions",
				});
			}

			if (guidance_scale < 1 || guidance_scale > 20) {
				return reply.code(400).send({
					error: "Invalid guidance scale",
				});
			}

			const result = (await generateMedia({
				prompt,
				type,
				negative_prompt,
				guidance_scale,
				width,
				height,
			})) as {
				data?: {
					has_nsfw_concepts?: boolean[];
					video?: { url?: string };
					audio?: { url?: string };
					images?: { url: string }[];
				};
			};

			if (!result || typeof result !== "object") {
				throw new Error("Invalid response format");
			}

			if (result.data?.has_nsfw_concepts?.[0] === true) {
				return reply.code(400).send({
					success: false,
					error: "NSFW content detected",
				});
			}

			let mediaUrl = "";

			if (type === MediaType.VIDEO && result.data?.video?.url) {
				mediaUrl = result.data.video.url;
			} else if (type === MediaType.AUDIO && result.data?.audio?.url) {
				mediaUrl = result.data.audio.url;
			} else if (result.data?.images && result.data.images.length > 0) {
				mediaUrl = result.data.images?.[0]?.url || "";
			}

			if (!mediaUrl) {
				return reply.code(500).send({
					success: false,
					error: `Failed to generate ${type}. Please try again.`,
				});
			}

			await incrementRateLimit(userPublicKey);

			return {
				success: true,
				mediaUrl,
				remainingGenerations: rateLimit.remaining - 1,
				resetTime: rateLimit.resetTime,
			};
		} catch (error) {
			return reply.code(500).send({
				error: error instanceof Error ? error.message : "Unknown error generating media",
			});
		}
	});

	fastify.post<{ Body: GenerateBothRequest }>("/generate-both", async (request, reply) => {
		try {
			const user = request.authUser;

			if (!user?.evm && !user?.solana && process.env.NODE_ENV !== "development") {
				console.log("Authentication failed: No valid wallet address found");
				return reply.code(401).send({
					success: false,
					error: "User authentication required",
				});
			}

			const userPublicKey = user?.evm || user?.solana || "dev";
			console.log("Using public key for rate limit:", userPublicKey);

			const rateLimit = await checkRateLimit(userPublicKey);
			if (!rateLimit.allowed) {
				return reply.code(429).send({
					success: false,
					error: "Rate limit exceeded",
					remainingGenerations: rateLimit.remaining,
					resetTime: rateLimit.resetTime,
				});
			}

			const {
				type = MediaType.IMAGE,
				negative_prompt,
				guidance_scale = 7.5,
				width = 1024,
				height = 1024,
				metadataPrompt,
				mode = "fast",
			} = request.body;

			const metadata = await generateMetadata({ prompt: metadataPrompt });

			if (!metadata) {
				return reply.code(500).send({
					success: false,
					error: "Failed to generate valid token metadata after maximum retries",
				});
			}

			if (width < 512 || width > 1024 || height < 512 || height > 1024) {
				return reply.code(400).send({
					error: "Invalid dimensions",
				});
			}

			if (guidance_scale < 1 || guidance_scale > 20) {
				return reply.code(400).send({
					error: "Invalid guidance scale",
				});
			}

			const result = (await generateMedia({
				prompt: metadata.prompt,
				type,
				negative_prompt,
				guidance_scale,
				width,
				height,
				mode,
			})) as {
				data?: {
					has_nsfw_concepts?: boolean[];
					video?: { url?: string };
					audio?: { url?: string };
					images?: { url: string }[];
				};
			};

			if (!result || typeof result !== "object") {
				throw new Error("Invalid response format");
			}

			if (result.data?.has_nsfw_concepts?.[0] === true) {
				return reply.code(400).send({
					success: false,
					error: "NSFW content detected",
				});
			}

			let mediaUrl = "";

			if (type === MediaType.VIDEO && result.data?.video?.url) {
				mediaUrl = result.data.video.url;
			} else if (type === MediaType.AUDIO && result.data?.audio?.url) {
				mediaUrl = result.data.audio.url;
			} else if (result.data?.images && result.data.images.length > 0) {
				mediaUrl = result.data.images?.[0]?.url || "";
			}

			if (!mediaUrl) {
				return reply.code(500).send({
					success: false,
					error: `Failed to generate ${type}. Please try again.`,
				});
			}

			await incrementRateLimit(userPublicKey);

			return {
				success: true,
				metadata,
				mediaUrl,
				remainingGenerations: rateLimit.remaining - 1,
				resetTime: rateLimit.resetTime,
			};
		} catch (error) {
			return reply.code(500).send({
				error: error instanceof Error ? error.message : "Unknown error generating token",
			});
		}
	});
}
