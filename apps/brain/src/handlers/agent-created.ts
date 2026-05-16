import type { AgentCreatedPayload } from "@waifufun/db";

import { composePostWithBlink } from "../lib/blink-suffix.js";
import { generateTweet } from "../llm/claude.js";
import { buildCreatedPrompt } from "../llm/prompt-builder.js";
import type { Handler, HandlerResult } from "./types.js";

/**
 * `agent.created` — first impression. We still prepend the "X just launched"
 * framing so followers know what they're looking at, then splice in the
 * agent's own in-character line.
 */
export const handleAgentCreated: Handler = async ({ event, persona, ctx }) => {
	const payload = event.payload as AgentCreatedPayload;
	const prompt = buildCreatedPrompt(persona, payload);

	const llmLine = await generateTweet(prompt, {
		logger: ctx.logger,
		apiKey: ctx.anthropicApiKey,
	});

	const bioSnippet = persona.bio ? ` ${persona.bio}` : "";
	const url = `waifu.fun/agent/${payload.tokenAddress}`;

	const baseText = llmLine
		? `${persona.name} just launched. ${llmLine} → ${url}`
		: `${persona.name} just launched.${bioSnippet} → ${url}`;

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
