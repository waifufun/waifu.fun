import type { RuntimeAdapter, RuntimeKind } from "./types.js";

export { MiladyCloudRuntimeAdapter, type MiladyClient } from "./adapters/milady-cloud.js";
export { ExternalPullRuntimeAdapter } from "./adapters/third-party-pull.js";
export { ExternalWebhookRuntimeAdapter } from "./adapters/third-party-webhook.js";
export type { Logger } from "./logger.js";
export type {
	AgentEventPayload,
	ProvisionOptions,
	ProvisionResult,
	RuntimeAdapter,
	RuntimeHealth,
	RuntimeKind,
} from "./types.js";

export function createRuntimeAdapterMap(adapters: Iterable<RuntimeAdapter>): Map<RuntimeKind, RuntimeAdapter> {
	return new Map(Array.from(adapters, (adapter) => [adapter.kind, adapter]));
}
