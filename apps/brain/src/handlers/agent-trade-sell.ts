import type { AgentTradeSellPayload } from "@waifufun/db";

import { generateTweet } from "../llm/claude.js";
import { buildSellPrompt, formatBnb } from "../llm/prompt-builder.js";
import type { Handler, HandlerResult } from "./index.js";

export const handleAgentTradeSell: Handler = async ({ event, persona, ctx }) => {
	const payload = event.payload as AgentTradeSellPayload;
	const prompt = buildSellPrompt(persona, payload);

	const llmLine = await generateTweet(prompt, {
		logger: ctx.logger,
		apiKey: ctx.anthropicApiKey,
	});

	const bnb = formatBnb(payload.bnbOut);
	const fallback = "whatever. more for the believers.";
	const reaction = llmLine ?? fallback;

	let text = `${persona.name} got hit with a ${bnb} BNB sell. she said: "${reaction}"`;
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
