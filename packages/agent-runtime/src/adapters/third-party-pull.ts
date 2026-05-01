import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import type { Logger } from "../logger.js";
import type {
	AgentEventPayload,
	ProvisionOptions,
	ProvisionResult,
	RuntimeAdapter,
	RuntimeHealth,
	RuntimeKind,
} from "../types.js";

export interface ExternalPullRuntimeAdapterOptions {
	logger?: Logger | undefined;
	emitControlEvent?: (agentId: string, event: AgentEventPayload) => Promise<void>;
	getLastSeenAt?: (agentId: string) => Promise<Date | null>;
}

export class ExternalPullRuntimeAdapter implements RuntimeAdapter {
	readonly kind: RuntimeKind = "third-party-pull";

	private readonly logger?: Logger | undefined;
	private readonly emitControlEvent?: (agentId: string, event: AgentEventPayload) => Promise<void>;
	private readonly getLastSeenAt?: (agentId: string) => Promise<Date | null>;

	constructor(opts: ExternalPullRuntimeAdapterOptions = {}) {
		this.logger = opts.logger;
		this.emitControlEvent = opts.emitControlEvent;
		this.getLastSeenAt = opts.getLastSeenAt;
	}

	async provision(opts: ProvisionOptions): Promise<ProvisionResult> {
		const runtimeApiKey = opts.apiKey ?? randomBytes(32).toString("base64url");
		const runtimeApiKeyHash = await bcrypt.hash(runtimeApiKey, 12);
		return { runtimeAgentId: opts.agentId, runtimeApiKey, runtimeApiKeyHash };
	}

	async dispatchEvent(agentId: string, event: AgentEventPayload): Promise<void> {
		this.logger?.debug?.("third-party pull runtime dispatch is stored for polling", {
			agentId,
			eventType: event.eventType,
		});
	}

	async pause(agentId: string): Promise<void> {
		await this.emit(agentId, "agent.paused");
	}

	async resume(agentId: string): Promise<void> {
		await this.emit(agentId, "agent.resumed");
	}

	async deprovision(agentId: string): Promise<void> {
		await this.emit(agentId, "agent.dormant");
	}

	async checkHealth(agentId: string): Promise<RuntimeHealth> {
		const lastSeenAt = (await this.getLastSeenAt?.(agentId)) ?? null;
		return {
			online: lastSeenAt !== null && Date.now() - lastSeenAt.getTime() < 5 * 60 * 1000,
			lastSeenAt,
		};
	}

	private async emit(agentId: string, eventType: string): Promise<void> {
		const event: AgentEventPayload = {
			eventType,
			agentId,
			data: { runtimeKind: this.kind },
			timestamp: new Date().toISOString(),
			eventId: crypto.randomUUID(),
		};
		await this.emitControlEvent?.(agentId, event);
	}
}
