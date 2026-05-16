import type { Logger } from "../logger.js";
import type {
	AgentEventPayload,
	ProvisionOptions,
	ProvisionResult,
	RuntimeAdapter,
	RuntimeHealth,
	RuntimeKind,
} from "../types.js";

export interface ElizaCreateAgentInput {
	agentName: string;
	agentConfig?: Record<string, unknown> | undefined;
}

export interface ElizaCreateAgentResult {
	agentId?: string;
	containerId?: string;
	agentName?: string;
	jobId?: string;
	status?: string;
	nodeId?: string;
	message?: string;
	livenessCheckUrl?: string;
}

export interface ElizaAgentStatus {
	status?: string;
	updated_at?: string;
	updatedAt?: string;
	latencyMs?: number;
}

export interface ElizaClient {
	createAgent(userId: string, data: ElizaCreateAgentInput): Promise<ElizaCreateAgentResult>;
	pauseAgent(agentId: string): Promise<unknown>;
	resumeAgent(agentId: string): Promise<unknown>;
	deprovisionAgent(agentId: string): Promise<unknown>;
	getAgent?(userId: string, agentId: string): Promise<ElizaAgentStatus>;
	dispatchEvent?(agentId: string, event: AgentEventPayload): Promise<unknown>;
}

export interface ElizaCloudRuntimeAdapterOptions {
	client: ElizaClient;
	logger?: Logger | undefined;
}

export class ElizaCloudRuntimeAdapter implements RuntimeAdapter {
	readonly kind: RuntimeKind = "eliza-cloud";

	private readonly client: ElizaClient;
	private readonly logger?: Logger | undefined;

	constructor(opts: ElizaCloudRuntimeAdapterOptions) {
		this.client = opts.client;
		this.logger = opts.logger;
	}

	async provision(opts: ProvisionOptions): Promise<ProvisionResult> {
		const result = await this.client.createAgent(opts.agentId, {
			agentName: opts.agentName,
			agentConfig: {
				persona: opts.persona,
				safeAddress: opts.safeAddress,
				xHandle: opts.xHandle,
			},
		});

		const runtimeAgentId = result.agentId ?? result.containerId ?? opts.agentId;
		this.logger?.info?.("provisioned eliza cloud runtime", {
			agentId: opts.agentId,
			runtimeAgentId,
			jobId: result.jobId,
			status: result.status,
		});

		return {
			containerId: result.containerId ?? result.agentId,
			runtimeAgentId,
			...(result.livenessCheckUrl ? { livenessCheckUrl: result.livenessCheckUrl } : {}),
		};
	}

	async dispatchEvent(agentId: string, event: AgentEventPayload): Promise<void> {
		if (!this.client.dispatchEvent) {
			this.logger?.debug?.("eliza client has no dispatchEvent; skipping runtime event", {
				agentId,
				eventType: event.eventType,
			});
			return;
		}
		await this.client.dispatchEvent(agentId, event);
	}

	async pause(agentId: string): Promise<void> {
		await this.client.pauseAgent(agentId);
	}

	async resume(agentId: string): Promise<void> {
		await this.client.resumeAgent(agentId);
	}

	async deprovision(agentId: string): Promise<void> {
		await this.client.deprovisionAgent(agentId);
	}

	async checkHealth(agentId: string): Promise<RuntimeHealth> {
		if (!this.client.getAgent) {
			return { online: true, lastSeenAt: null };
		}

		const started = Date.now();
		try {
			const status = await this.client.getAgent(agentId, agentId);
			const updatedAt = status.updated_at ?? status.updatedAt;
			return {
				online: status.status !== "stopped" && status.status !== "failed",
				lastSeenAt: updatedAt ? new Date(updatedAt) : null,
				latencyMs: status.latencyMs ?? Date.now() - started,
			};
		} catch (err) {
			return {
				online: false,
				lastSeenAt: null,
				latencyMs: Date.now() - started,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
}
