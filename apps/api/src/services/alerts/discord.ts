export type DiscordAlertSeverity = "info" | "warn" | "crit";

export interface DiscordAlertField {
	name: string;
	value: string;
}

export interface DiscordAlertOptions {
	webhookUrl: string;
	severity: DiscordAlertSeverity;
	title: string;
	description?: string;
	agentId?: string;
	fields?: DiscordAlertField[];
}

const COLOR_BY_SEVERITY: Record<DiscordAlertSeverity, number> = {
	info: 0x22c55e,
	warn: 0xfacc15,
	crit: 0xef4444,
};

export async function sendDiscordAlert(opts: DiscordAlertOptions): Promise<void> {
	try {
		const response = await fetch(opts.webhookUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(buildDiscordAlertPayload(opts)),
		});

		if (!response.ok) {
			console.warn("[discord-alert] webhook returned non-2xx", {
				status: response.status,
				statusText: response.statusText,
			});
		}
	} catch (error) {
		console.warn("[discord-alert] failed to send alert", { error });
	}
}

export function buildDiscordAlertPayload(opts: DiscordAlertOptions): Record<string, unknown> {
	const fields: DiscordAlertField[] = [];

	if (opts.agentId) {
		fields.push({ name: "agentId", value: formatAgentId(opts.agentId) });
	}

	if (opts.fields) {
		fields.push(...opts.fields);
	}

	return {
		embeds: [
			{
				title: opts.title,
				description: opts.description,
				color: COLOR_BY_SEVERITY[opts.severity],
				timestamp: new Date().toISOString(),
				fields,
			},
		],
	};
}

function formatAgentId(agentId: string): string {
	const frontendUrl = process.env.WAIFU_FRONTEND_URL?.replace(/\/$/, "");
	if (!frontendUrl) return agentId;

	return `[${agentId}](${frontendUrl}/agent/${encodeURIComponent(agentId)})`;
}
