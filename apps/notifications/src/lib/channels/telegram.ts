/**
 * Telegram channel.
 *
 * Uses the Bot API's `sendMessage` with HTML parse mode. Each subscription
 * stores a chat ID (numeric or `@channelname`); the bot token is normally
 * the platform-wide `TELEGRAM_BOT_TOKEN`, but a subscription may override it.
 */

import type { FormattedMessage } from "../types.js";

const HTML_ESCAPE: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
};

function escapeHtml(s: string): string {
	return s.replace(/[&<>]/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

export interface TelegramPayload {
	chat_id: string;
	text: string;
	parse_mode: "HTML";
	disable_web_page_preview: boolean;
}

export function buildTelegramPayload(chatId: string, message: FormattedMessage): TelegramPayload {
	const lines: string[] = [];
	lines.push(`<b>${escapeHtml(message.title)}</b>`);
	if (message.description) lines.push(escapeHtml(message.description));
	for (const field of message.fields) {
		lines.push(`• <b>${escapeHtml(field.name)}</b>: ${escapeHtml(field.value)}`);
	}
	if (message.url) lines.push(`<a href="${escapeHtml(message.url)}">View launch</a>`);

	return {
		chat_id: chatId,
		text: lines.join("\n"),
		parse_mode: "HTML",
		disable_web_page_preview: false,
	};
}

export interface TelegramSendDeps {
	fetchImpl?: typeof fetch;
}

export async function sendTelegramMessage(
	botToken: string,
	payload: TelegramPayload,
	deps: TelegramSendDeps = {},
): Promise<{ status: "sent" | "failed"; statusCode: string; error: string | null }> {
	const fetchImpl = deps.fetchImpl ?? fetch;
	const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
	try {
		const response = await fetchImpl(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			let body = "";
			try {
				body = await response.text();
			} catch {
				// ignore body read errors
			}
			return {
				status: "failed",
				statusCode: response.status.toString(),
				error: `telegram sendMessage returned ${response.status}: ${body.slice(0, 200)}`,
			};
		}
		return { status: "sent", statusCode: response.status.toString(), error: null };
	} catch (error) {
		return {
			status: "failed",
			statusCode: "0",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
