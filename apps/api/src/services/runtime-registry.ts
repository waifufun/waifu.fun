import {
	type AgentEventPayload,
	ExternalPullRuntimeAdapter,
	ExternalWebhookRuntimeAdapter,
	ElizaCloudRuntimeAdapter,
	type RuntimeAdapter,
	type RuntimeKind,
	createRuntimeAdapterMap,
} from "@waifufun/agent-runtime";
import { agentPersonaQueries, getDatabase } from "@waifufun/db";

import { emitAgentEvent } from "./events/emit.js";
import { getElizaClient } from "./eliza-client.js";

let registry: Map<RuntimeKind, RuntimeAdapter> | null = null;

export function getRuntimeRegistry(): Map<RuntimeKind, RuntimeAdapter> {
	if (registry) return registry;

	const created = createRuntimeAdapterMap([
		new ElizaCloudRuntimeAdapter({ client: getElizaClient() }),
		new ExternalWebhookRuntimeAdapter({
			getRegistration: async (agentId) => {
				const persona = await getPersona(agentId);
				if (!persona?.runtimeWebhookUrl) return null;
				const rawSecret = process.env.WAIFU_RUNTIME_WEBHOOK_SECRET;
				if (!rawSecret) return null;
				return {
					webhookUrl: persona.runtimeWebhookUrl,
					webhookSecret: rawSecret,
					lastSeenAt: persona.runtimeLastSeenAt,
				};
			},
		}),
		new ExternalPullRuntimeAdapter({
			emitControlEvent: async (agentId: string, event: AgentEventPayload) => {
				await emitAgentEvent({
					agentId,
					eventType: event.eventType as Parameters<typeof emitAgentEvent>[0]["eventType"],
					data: event.data,
				});
			},
			getLastSeenAt: async (agentId: string) => (await getPersona(agentId))?.runtimeLastSeenAt ?? null,
		}),
	]);

	registry = created;
	return created;
}

async function getPersona(agentId: string) {
	const { db } = getDatabase();
	return agentPersonaQueries.getAgentPersonaByAgentId(db, agentId);
}
