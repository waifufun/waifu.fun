import type { AgentTradeBuyPayload } from "@waifufun/db";

import { generateTweet } from "../llm/claude.js";
import { buildBuyPrompt, formatBnb } from "../llm/prompt-builder.js";
import type { Handler, HandlerResult } from "./index.js";

export const handleAgentTradeBuy: Handler = async ({ event, persona, ctx }) => {
	const payload = event.payload as AgentTradeBuyPayload;
	const prompt = buildBuyPrompt(persona, payload);

	const llmLine = await generateTweet(prompt, {
		logger: ctx.logger,
		apiKey: ctx.anthropicApiKey,
	});

	const bnb = formatBnb(payload.bnbIn);
	const fallback = "feels good.";
	const reaction = llmLine ?? fallback;

	let text = `${persona.name} got a ${bnb} BNB buy. she said: "${reaction}"`;
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
