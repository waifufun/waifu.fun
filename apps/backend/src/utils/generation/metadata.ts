import { fal } from "@fal-ai/client";
import { createTokenPrompt } from "../../prompts/create-token";
import { falApiKey } from "@autofun/constants";

const MAX_RETRIES = 10;
const RETRY_DELAY = 500;

interface TokenMetadata {
	name: string;
	symbol: string;
	description: string;
	prompt: string;
}

interface GenerateMetadataParams {
	fields?: string[];
	existingData?: {
		name?: string;
		symbol?: string;
		description?: string;
		prompt?: string;
	};
	prompt?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function validateMetadata(metadata: any): metadata is TokenMetadata {
	return (
		typeof metadata.name === "string" &&
		typeof metadata.symbol === "string" &&
		typeof metadata.description === "string" &&
		typeof metadata.prompt === "string" &&
		metadata.name.length > 0 &&
		metadata.symbol.length >= 3 &&
		metadata.symbol.length <= 5 &&
		metadata.description.length >= 10 &&
		metadata.prompt.length >= 10
	);
}

function extractMetadataFromString(text: string): TokenMetadata | null {
	const nameMatch = text.match(/"name"\s*:\s*"([^"]+)"/);
	const symbolMatch = text.match(/"symbol"\s*:\s*"([^"]+)"/);
	const descMatch = text.match(/"description"\s*:\s*"([^"]+)"/);
	const promptMatch = text.match(/"prompt"\s*:\s*"([^"]+)"/);

	if (!nameMatch?.[1] || !symbolMatch?.[1] || !descMatch?.[1] || !promptMatch?.[1]) {
		return null;
	}

	const metadata = {
		name: nameMatch[1],
		symbol: symbolMatch[1].toUpperCase(),
		description: descMatch[1],
		prompt: promptMatch[1],
	};

	return validateMetadata(metadata) ? metadata : null;
}

export async function generateMetadata(data: GenerateMetadataParams): Promise<TokenMetadata | null> {
	console.log("[generateMetadata] Starting metadata generation with prompt:", data.prompt);
	if (!falApiKey) {
		throw new Error("FAL_API_KEY environment variable not set for metadata generation.");
	}
	fal.config({ credentials: falApiKey });

	let retryCount = 0;

	while (retryCount < MAX_RETRIES) {
		try {
			console.log(`[generateMetadata] Attempt ${retryCount + 1}/${MAX_RETRIES}`);
			const systemPromptContent = await createTokenPrompt({ prompt: data.prompt });
			console.log("[generateMetadata] Generated system prompt:", systemPromptContent);

			const response = await fal.subscribe("fal-ai/any-llm", {
				input: {
					prompt: "Generate the token metadata based on the system prompt.",
					system_prompt: systemPromptContent,
					model: "google/gemini-flash-1.5",
				},
				logs: true,
			});

			const rawOutput = response?.data?.output || "";
			const jsonRegex = /{[\s\S]*}/;
			const jsonString = typeof rawOutput === "string" ? rawOutput.match(jsonRegex)?.[0] : null;

			if (!jsonString) {
				retryCount++;
				continue;
			}

			try {
				const parsed = JSON.parse(jsonString);
				if (validateMetadata(parsed)) {
					console.log("[generateMetadata] Successfully validated metadata:", parsed);
					return parsed;
				}
			} catch {
				const extracted = extractMetadataFromString(jsonString);
				if (extracted) {
					console.log("[generateMetadata] Successfully extracted metadata:", extracted);
					return extracted;
				}
			}

			retryCount++;
		} catch (error) {
			console.error("[generateMetadata] Error during attempt:", error);
			retryCount++;
			if (retryCount < MAX_RETRIES) {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
			}
		}
	}

	return null;
}
