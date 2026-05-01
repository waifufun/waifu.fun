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

export interface ExternalWebhookRegistration {
	webhookUrl: string;
	webhookSecret: string;
	lastSeenAt?: Date | null | undefined;
}

export interface ExternalWebhookRuntimeAdapterOptions {
	logger?: Logger | undefined;
	getRegistration?: (agentId: string) => Promise<ExternalWebhookRegistration | null>;
	fetchImpl?: typeof fetch;
}

export class ExternalWebhookRuntimeAdapter implements RuntimeAdapter {
	readonly kind: RuntimeKind = "third-party-webhook";

	private readonly registrations = new Map<string, ExternalWebhookRegistration>();
	private readonly logger?: Logger | undefined;
	private readonly getRegistration?: (agentId: string) => Promise<ExternalWebhookRegistration | null>;
	private readonly fetchImpl: typeof fetch;

	constructor(opts: ExternalWebhookRuntimeAdapterOptions = {}) {
		this.logger = opts.logger;
		this.getRegistration = opts.getRegistration;
		this.fetchImpl = opts.fetchImpl ?? fetch;
	}

	async provision(opts: ProvisionOptions): Promise<ProvisionResult> {
		if (!opts.webhookUrl) throw new Error("webhookUrl is required for third-party-webhook runtime");
		if (!opts.webhookSecret) {
			throw new Error("webhookSecret is required for third-party-webhook runtime");
		}

		const webhookUrl = normalizeWebhookUrl(opts.webhookUrl);
		const res = await this.fetchImpl(appendPath(webhookUrl, "/provision"), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-waifu-webhook-secret": opts.webhookSecret,
			},
			body: JSON.stringify({
				agentId: opts.agentId,
				agentName: opts.agentName,
				persona: opts.persona,
			}),
		});

		if (!res.ok) {
			throw new Error(`third-party webhook provision ping failed: ${res.status} ${await safeText(res)}`);
		}

		const runtimeWebhookSecretHash = await bcrypt.hash(opts.webhookSecret, 12);
		this.registrations.set(opts.agentId, {
			webhookUrl,
			webhookSecret: opts.webhookSecret,
			lastSeenAt: new Date(),
		});
		this.logger?.info?.("registered third-party webhook runtime", { agentId: opts.agentId });

		return {
			runtimeAgentId: opts.agentId,
			runtimeWebhookSecretHash,
			livenessCheckUrl: appendPath(webhookUrl, "/health"),
		};
	}

	async dispatchEvent(agentId: string, event: AgentEventPayload): Promise<void> {
		const registration = await this.registrationFor(agentId);
		await this.post(registration, "", event);
		registration.lastSeenAt = new Date();
	}

	async pause(agentId: string): Promise<void> {
		await this.dispatchEvent(agentId, controlEvent(agentId, "agent.paused"));
	}

	async resume(agentId: string): Promise<void> {
		await this.dispatchEvent(agentId, controlEvent(agentId, "agent.resumed"));
	}

	async deprovision(agentId: string): Promise<void> {
		await this.dispatchEvent(agentId, controlEvent(agentId, "agent.dormant"));
		this.registrations.delete(agentId);
	}

	async checkHealth(agentId: string): Promise<RuntimeHealth> {
		const registration = await this.registrationFor(agentId);
		const started = Date.now();
		try {
			const res = await this.fetchImpl(appendPath(registration.webhookUrl, "/health"), {
				method: "GET",
				headers: { "x-waifu-webhook-secret": registration.webhookSecret },
			});
			if (res.status === 404 || res.status === 405 || res.status === 501) {
				const lastSeenAt = registration.lastSeenAt ?? null;
				return { online: isFresh(lastSeenAt), lastSeenAt, latencyMs: Date.now() - started };
			}
			return {
				online: res.ok,
				lastSeenAt: res.ok ? new Date() : (registration.lastSeenAt ?? null),
				latencyMs: Date.now() - started,
				...(res.ok ? {} : { error: `${res.status} ${await safeText(res)}` }),
			};
		} catch (err) {
			const lastSeenAt = registration.lastSeenAt ?? null;
			if (isFresh(lastSeenAt)) return { online: true, lastSeenAt, latencyMs: Date.now() - started };
			return {
				online: false,
				lastSeenAt,
				latencyMs: Date.now() - started,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	private async post(registration: ExternalWebhookRegistration, path: string, body: AgentEventPayload): Promise<void> {
		const res = await this.fetchImpl(appendPath(registration.webhookUrl, path), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-waifu-webhook-secret": registration.webhookSecret,
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) throw new Error(`third-party webhook dispatch failed: ${res.status} ${await safeText(res)}`);
	}

	private async registrationFor(agentId: string): Promise<ExternalWebhookRegistration> {
		const stored = this.registrations.get(agentId) ?? (await this.getRegistration?.(agentId)) ?? null;
		if (!stored) throw new Error(`third-party webhook runtime is not registered for ${agentId}`);
		this.registrations.set(agentId, stored);
		return stored;
	}
}

function normalizeWebhookUrl(url: string): string {
	const parsed = new URL(url);
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new Error("webhookUrl must be http or https");
	}
	parsed.pathname = parsed.pathname.replace(/\/+$/, "");
	parsed.search = "";
	parsed.hash = "";
	return parsed.toString().replace(/\/+$/, "");
}

function appendPath(base: string, path: string): string {
	return `${base.replace(/\/+$/, "")}${path}`;
}

function controlEvent(agentId: string, eventType: string): AgentEventPayload {
	return {
		eventType,
		agentId,
		data: {},
		timestamp: new Date().toISOString(),
		eventId: crypto.randomUUID(),
	};
}

function isFresh(lastSeenAt: Date | null): boolean {
	return lastSeenAt !== null && Date.now() - lastSeenAt.getTime() < 5 * 60 * 1000;
}

async function safeText(res: Response): Promise<string> {
	return res.text().catch(() => "");
}
