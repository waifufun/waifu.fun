import { fal } from "@fal-ai/client";

interface TokenMetadata {
	name: string;
	symbol: string;
	description: string;
}

export async function generateLyrics(metadata: TokenMetadata, stylePrompt: string): Promise<string> {
	try {
		if (!process.env.FAL_API_KEY) {
			throw new Error("FAL_API_KEY environment variable not set for lyrics generation.");
		}
		fal.config({ credentials: process.env.FAL_API_KEY });

		const prompt = `Generate song lyrics for a token with the following metadata:
    Name: ${metadata.name}
    Symbol: ${metadata.symbol}
    Description: ${metadata.description}
    
    Style: ${stylePrompt}
    
    Generate lyrics that reflect the token's theme and style. Format the lyrics with timestamps like this:
    [00:00] First line
    [00:04] Second line
    etc.`;

		const falInput = {
			model: "anthropic/claude-3.5-sonnet" as const,
			prompt: prompt,
		};

		interface FalResponse {
			data?: { output?: string };
			output?: string;
		}

		const response: FalResponse = await fal.subscribe("fal-ai/any-llm", {
			input: falInput,
			logs: true,
		});

		let lyrics = response?.data?.output || response?.output || "";
		lyrics = lyrics.trim();

		if (!lyrics || lyrics.length < 50) {
			console.error("Failed to generate valid lyrics from Fal AI. Response:", lyrics);
			return "[00:00] Default lyrics\n[00:04] For testing purposes";
		}

		return lyrics;
	} catch (error) {
		console.error("Error generating lyrics:", error);
		return "[00:00] Default lyrics\n[00:04] For testing purposes";
	}
}

export function formatLyricsForDiffrhythm(lyrics: string): string {
	const lines = lyrics.split("\n").filter((line) => line.trim());
	return lines
		.map((line) => {
			const match = line.match(/\[(\d{2}:\d{2})\](.*)/);
			if (match) {
				const [_, timestamp, content] = match;
				return `${timestamp}${content?.trim() || ""}`;
			}
			return line;
		})
		.join("\n");
}
