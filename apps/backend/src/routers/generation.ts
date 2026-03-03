import type { FastifyInstance } from "fastify";
import { generateMetadata } from "../utils/generation/metadata";
import { generateMedia } from "../utils/generation/media";
import { MediaType, type SolanaNetworkIds, type AddressLike, type TChain } from "@waifufun/types";
import { checkRateLimit, incrementRateLimit } from "../utils/generation/ratelimit";
import DB from "@waifufun/database";
import { SolanaRpcProvider } from "@waifufun/rpc";
import { authenticationMiddleware } from "../middlewares/authentication";

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
	address: AddressLike;
	chain?: TChain;
	chainId?: SolanaNetworkIds;
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

const getMinBalance = (type: MediaType, mode: "fast" | "pro"): number => {
	if (type === MediaType.IMAGE) {
		return mode === "fast"
			? Number(process.env.GENERATION_IMAGE_MIN_BALANCE_FAST || 10000)
			: Number(process.env.GENERATION_IMAGE_MIN_BALANCE || 1000);
	}

	return mode === "fast"
		? Number(process.env.GENERATION_VIDEO_MIN_BALANCE_FAST || 100000)
		: Number(process.env.GENERATION_VIDEO_MIN_BALANCE || 10000);
};

export default async function generationRoutes(fastify: FastifyInstance) {
	const GENERATION_TIMEOUT = 300000; // 5 minutes

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

	fastify.post<{ Body: GenerateMediaRequest }>(
		"/generate",
		{
			config: {
				timeout: GENERATION_TIMEOUT,
			},
		},
		async (request, reply) => {
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

				if (!user?.solana) {
					return reply.code(400).send({
						message: "Solana wallet address only supported for media generation",
					});
				}

				const mode = "fast" as "fast" | "pro";

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
					mode,
				})) as {
					data?: {
						has_nsfw_concepts?: boolean[];
						video?: { url?: string };
						audio?: { url?: string };
						images?: { url: string }[];
					};
				};
				console.log("Media generation result:", result);

				if (!result || typeof result !== "object") {
					throw new Error("Invalid response format");
				}

				if (result.data?.has_nsfw_concepts?.[0] === true) {
					return reply.code(400).send({
						success: false,
						message: "NSFW content detected",
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
		},
	);

	fastify.post<{ Body: GenerateMediaRequest }>(
		"/generate-media",
		{
			config: {
				timeout: GENERATION_TIMEOUT,
			},
			preHandler: authenticationMiddleware,
		},
		async (request, reply) => {
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
					address,
				} = request.body;
				console.log({ body: request.body, userPublicKey });

				if (!prompt || prompt.length > 2000) {
					return reply.code(400).send({
						error: "Invalid prompt length",
					});
				}

				if (!user?.solana) {
					return reply.code(400).send({
						message: "Solana wallet address only supported for media generation",
					});
				}

				if (!address || typeof address !== "string" || address.length < 10) {
					return reply.code(400).send({
						message: "Invalid token address",
					});
				}

				const token = await DB.Token.findOne({
					chain: "solana",
					chainId: request.body.chainId || 101,
					contractAddress: address,
				}).lean();

				if (!token) {
					return reply.code(404).send({
						error: `Token not found on ${request.body.chainId === 103 ? "devnet" : "mainnet"}`,
					});
				}

				const chain = request.body.chain || "solana";
				const chainId = request.body.chainId || 101;

				if (chain !== "solana") {
					// Only allow Solana
					return reply.code(400).send({
						error: "Only Solana chain is supported for media generation",
					});
				}

				if (chainId !== 101 && chainId !== 103) {
					// Only allow mainnet and devnet
					return reply.code(400).send({
						error: "Only Solana mainnet (101) and devnet (103) are supported for media generation",
					});
				}

				console.log(`Generating media for token ${address} on ${chain} ${chainId === 103 ? "devnet" : "mainnet"}`);

				const rpc = new SolanaRpcProvider(chainId);
				const balance = await rpc.getTokenBalance(address, user.solana);

				const slowBalanceNeeded = getMinBalance(type, "fast");
				const fastBalanceNeeded = getMinBalance(type, "pro");
				let mode = "fast" as "fast" | "pro";

				// derive possible mode based on balance
				let requiredBalance = slowBalanceNeeded;
				if (type === MediaType.VIDEO || type === MediaType.AUDIO) {
					requiredBalance = fastBalanceNeeded;
					mode = "pro";
				}
				if (balance >= fastBalanceNeeded) {
					mode = "pro";
					requiredBalance = fastBalanceNeeded;
				} else if (balance >= slowBalanceNeeded) {
					mode = "fast";
					requiredBalance = slowBalanceNeeded;
				}

				if (!balance || balance < requiredBalance) {
					const networkName = chainId === 103 ? "devnet" : "mainnet";
					return reply.code(400).send({
						message: `Insufficient balance to generate ${type} in ${mode} mode on ${networkName}. Minimum required: ${requiredBalance} tokens, current: ${balance}`,
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

				console.log("current mode:", mode);

				const result = (await generateMedia({
					prompt,
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
						message: "NSFW content detected",
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
					chain,
					chainId,
					networkName: chainId === 103 ? "devnet" : "mainnet",
					remainingGenerations: rateLimit.remaining - 1,
					resetTime: rateLimit.resetTime,
				};
			} catch (error) {
				return reply.code(500).send({
					error: error instanceof Error ? error.message : "Unknown error generating media",
				});
			}
		},
	);

	fastify.post<{ Body: GenerateBothRequest }>("/generate-both", async (request, reply) => {
		try {
			const user = request.authUser;

			if (!user?.evm && !user?.solana && process.env.NODE_ENV !== "development") {
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
