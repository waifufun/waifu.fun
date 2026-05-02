import type { Logger } from "../lib/logger.js";
import type { PromptBundle } from "./prompt-builder.js";

/**
 * Minimal Anthropic Messages API client (no SDK dependency).
 *
 * We call the REST endpoint directly so we don't pull in `@anthropic-ai/sdk`
 * just for a single POST. Use `claude-haiku-4` by default — cheap, fast,
 * plenty good for sub-280-char in-character tweets.
 *
 * If `ANTHROPIC_API_KEY` isn't set, `generateTweet` returns `null` and the
 * handler falls back to a template tweet.
 */

const DEFAULT_MODEL = process.env.BRAIN_LLM_MODEL ?? "claude-haiku-4-20251001";
const DEFAULT_MAX_TOKENS = Number(process.env.BRAIN_LLM_MAX_TOKENS ?? 200);
const DEFAULT_TIMEOUT_MS = Number(process.env.BRAIN_LLM_TIMEOUT_MS ?? 15_000);
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessageResponse {
	id?: string;
	type?: string;
	role?: string;
	content?: Array<{ type: string; text?: string }>;
	stop_reason?: string;
	model?: string;
}

export interface GenerateTweetOpts {
	logger: Logger;
	apiKey: string | undefined;
	model?: string;
	maxTokens?: number;
	timeoutMs?: number;
}

export async function generateTweet(prompt: PromptBundle, opts: GenerateTweetOpts): Promise<string | null> {
	if (!opts.apiKey || opts.apiKey.length === 0) {
		opts.logger.debug("claude: no ANTHROPIC_API_KEY, falling back to template");
		return null;
	}

	const model = opts.model ?? DEFAULT_MODEL;
	const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(ANTHROPIC_API_URL, {
			method: "POST",
			signal: controller.signal,
			headers: {
				"content-type": "application/json",
				"x-api-key": opts.apiKey,
				"anthropic-version": ANTHROPIC_VERSION,
			},
			body: JSON.stringify({
				model,
				max_tokens: maxTokens,
				system: prompt.system,
				messages: [
					{
						role: "user",
						content: prompt.user,
					},
				],
			}),
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => "<no body>");
			opts.logger.warn({ status: response.status, body: errText.slice(0, 500), model }, "claude: non-2xx response");
			return null;
		}

		const data = (await response.json()) as AnthropicMessageResponse;
		const text = data.content
			?.filter((c) => c.type === "text" && typeof c.text === "string")
			.map((c) => c.text ?? "")
			.join("\n")
			.trim();

		if (!text || text.length === 0) {
			opts.logger.warn({ model, stopReason: data.stop_reason }, "claude: empty text content");
			return null;
		}
		return sanitizeTweet(text);
	} catch (err) {
		opts.logger.warn({ err, model }, "claude: generation failed");
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Strip common LLM-fluff and enforce a hard 280-char cap so we never post
 * an over-length tweet. Also removes surrounding quote chars that some
 * models love to wrap responses in.
 */
export function sanitizeTweet(raw: string): string {
	let t = raw.trim();
	// Strip wrapping straight/smart quotes.
	const pairs: Array<[string, string]> = [
		['"', '"'],
		["'", "'"],
		["\u201C", "\u201D"],
		["\u2018", "\u2019"],
	];
	for (const [open, close] of pairs) {
		if (t.startsWith(open) && t.endsWith(close) && t.length >= 2) {
			t = t.slice(1, -1).trim();
		}
	}
	// Collapse excessive whitespace.
	t = t.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
	// Hard cap.
	if (t.length > 280) {
		t = `${t.slice(0, 277).trimEnd()}...`;
	}
	return t;
}
