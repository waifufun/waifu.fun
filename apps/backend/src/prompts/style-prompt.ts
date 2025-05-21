import { fal } from "@fal-ai/client";

export async function generateStylePrompt(userPrompt: string): Promise<string> {
	try {
		if (!process.env.FAL_API_KEY) {
			throw new Error("FAL_API_KEY environment variable not set for style generation.");
		}
		fal.config({ credentials: process.env.FAL_API_KEY });

		const prompt = `Prompt: ${userPrompt}
  
    Generate a style for this prompt. An example of a style is "pop", "rock", "EDM", etc. Return only the style, nothing else.`;

		const falInput = {
			model: "anthropic/claude-3.5-sonnet" as const,
			prompt: prompt,
		};

		type FalResponse = {
			data?: { output?: string };
			output?: string;
		};

		const response: FalResponse = await fal.subscribe("fal-ai/any-llm", {
			input: falInput,
			logs: true,
		});

		let style = response?.data?.output || response?.output || "";
		style = style.trim();

		if (!style || style.length < 10) {
			console.error("Failed to generate valid style from Fal AI. Response:", style);
			return "An upbeat modern pop song";
		}

		return style;
	} catch (error) {
		console.error("Error generating style:", error);
		return "An upbeat modern pop song";
	}
}
