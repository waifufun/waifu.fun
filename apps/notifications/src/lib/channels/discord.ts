/**
 * Discord webhook channel.
 *
 * Posts a single embed describing the launch event. Colour coding mirrors
 * the existing `apps/api/src/services/alerts/discord.ts` style so creators
 * who already configured a Discord webhook see consistent visuals.
 */

import type { EventType, FormattedMessage } from "../types.js";

const COLOR_BY_EVENT: Record<EventType, number> = {
	round_opened: 0x22c55e, // green
	cap_hit: 0xf59e0b, // amber
	launched: 0x3b82f6, // blue
	tranche_deployed: 0x8b5cf6, // purple
	summary_24h: 0x64748b, // slate
};

export interface DiscordPayload {
	embeds: Array<{
		title: string;
		description?: string;
		url?: string;
		color: number;
		timestamp: string;
		fields: Array<{ name: string; value: string; inline?: boolean }>;
	}>;
}

export function buildDiscordPayload(eventType: EventType, message: FormattedMessage): DiscordPayload {
	return {
		embeds: [
			{
				title: message.title,
				description: message.description || undefined,
				url: message.url ?? undefined,
				color: COLOR_BY_EVENT[eventType],
				timestamp: new Date().toISOString(),
				fields: message.fields.map((f) => ({ name: f.name, value: f.value, inline: true })),
			},
		],
	};
}

export interface DiscordSendDeps {
	fetchImpl?: typeof fetch;
}

export async function sendDiscordWebhook(
	webhookUrl: string,
	payload: DiscordPayload,
	deps: DiscordSendDeps = {},
): Promise<{ status: "sent" | "failed"; statusCode: string; error: string | null }> {
	const fetchImpl = deps.fetchImpl ?? fetch;
	try {
		const response = await fetchImpl(webhookUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			return {
				status: "failed",
				statusCode: response.status.toString(),
				error: `discord webhook returned ${response.status} ${response.statusText}`,
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
