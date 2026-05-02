import type { AgentEvent, AgentEventType } from "@waifufun/db";

import { type DiscordAlertField, sendDiscordAlert } from "./discord.js";

type AlertSeverity = "info" | "warn" | "crit";

interface AgentEventAlertConfig {
	severity: AlertSeverity;
	title: string;
	description?: string;
	fields?: DiscordAlertField[];
}

export async function dispatchAgentEventAlert(row: AgentEvent): Promise<void> {
	const webhookUrl = process.env.DISCORD_OPS_WEBHOOK_URL?.trim();
	if (!webhookUrl) return;

	const config = buildAgentEventAlert(row);
	if (!config) return;

	await sendDiscordAlert({
		webhookUrl,
		severity: config.severity,
		title: config.title,
		...(config.description ? { description: config.description } : {}),
		...(row.agentId ? { agentId: row.agentId } : {}),
		fields: [{ name: "event", value: row.eventType }, ...(config.fields ?? [])],
	});
}

export function buildAgentEventAlert(row: AgentEvent): AgentEventAlertConfig | null {
	switch (row.eventType) {
		case "agent.provisioning_dead_letter":
			return withOptionalDescription(
				{
					severity: "crit",
					title: "Agent failed to provision after 3 attempts",
				},
				stringField(row.data, "error") ?? stringField(row.data, "reason"),
			);
		case "agent.killed":
			return withOptionalDescription(
				{
					severity: "crit",
					title: "Agent killed",
				},
				stringField(row.data, "reason"),
			);
		case "agent.kill_activated":
			return withOptionalDescription(
				{
					severity: "warn",
					title: "Agent kill switch activated",
				},
				stringField(row.data, "reason"),
			);
		case "agent.dormant":
			return {
				severity: "warn",
				title: "Agent dormant",
				fields: optionalField("creditsTopUpCount", row.data.creditsTopUpCount),
			};
		case "agent.resurrected":
			return {
				severity: "info",
				title: "Agent resurrected",
			};
		case "agent.credits.depleted":
			return {
				severity: "warn",
				title: "Agent credits depleted",
			};
		case "tax.split.configured":
			return {
				severity: "info",
				title: "Tax split configured",
			};
		default:
			return null;
	}
}

export const ALERT_AGENT_EVENT_TYPES = new Set<AgentEventType>([
	"agent.provisioning_dead_letter",
	"agent.killed",
	"agent.kill_activated",
	"agent.dormant",
	"agent.resurrected",
	"agent.credits.depleted",
	"tax.split.configured",
]);

function optionalField(name: string, value: unknown): DiscordAlertField[] {
	if (value === null || value === undefined) return [];
	return [{ name, value: String(value) }];
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" ? value : null;
}

function withOptionalDescription(config: AgentEventAlertConfig, description: string | null): AgentEventAlertConfig {
	if (!description) return config;
	return { ...config, description };
}
