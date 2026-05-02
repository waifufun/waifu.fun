import type { AgentGraduatedPayload } from "@waifufun/db";

import { composePostWithBlink } from "../lib/blink-suffix.js";
import { generateTweet } from "../llm/claude.js";
import { buildGraduatedPrompt } from "../llm/prompt-builder.js";
import type { Handler, HandlerResult } from "./index.js";

export const handleAgentGraduated: Handler = async ({ event, persona, ctx }) => {
	const payload = event.payload as AgentGraduatedPayload;
	const prompt = buildGraduatedPrompt(persona, payload);

	const llmLine = await generateTweet(prompt, {
		logger: ctx.logger,
		apiKey: ctx.anthropicApiKey,
	});

	const fallback = "made it.";
	const reaction = llmLine ?? fallback;

	const baseText = `${persona.name} graduated. now on pancakeswap. "${reaction}"`;

	let text = composePostWithBlink(baseText, payload.tokenAddress, {
		blinkBaseUrl: process.env.WAIFU_BLINKS_BASE_URL,
	});

	if (text.length > 280) {
		text = `${text.slice(0, 277).trimEnd()}...`;
	}

	const post = await ctx.twitter.post(text, {
		agentId: persona.agentId,
		eventType: event.type,
	});

	const result: HandlerResult = { ok: post.ok, tweet: text };
	if (!post.ok) {
		result.errorMessage = post.error ?? "twitter post failed";
	}
	return result;
};
