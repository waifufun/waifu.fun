/**
 * Milady Cloud API client — service-account bridge.
 *
 * waifu-core acts as a gateway: the frontend never talks to milady-cloud
 * directly. This client signs requests with a service JWT that has admin
 * access to the milady-cloud backend running on the same host.
 */

import * as jose from "jose";
import type { Address } from "viem";

// ─── Types ────────────────────────────────────────────────────────

export interface MiladyAvailability {
	totalSlots: number;
	usedSlots: number;
	availableSlots: number;
	nodes: unknown[];
}

export interface CreateAgentInput {
	agentName: string;
	agentConfig?: Record<string, unknown> | undefined;
}

export interface Logger {
	debug?: (message: string, meta?: Record<string, unknown>) => void;
	info?: (message: string, meta?: Record<string, unknown>) => void;
	warn?: (message: string, meta?: Record<string, unknown>) => void;
	error?: (message: string, meta?: Record<string, unknown>) => void;
}

export type AgentSpec = {
	personaId: string;
	xHandle: string | null;
	taxConfig: unknown;
	safeAddress: Address | null;
};

export interface ProvisionAgentInput {
	agentId: string;
	spec: AgentSpec;
}

export interface MiladyAgent {
	agent_id: string;
	agent_name: string;
	status: string;
	node_id: string;
	containerUrl: string;
	webUiUrl: string | null;
	created_at: string;
	updated_at: string;
	[key: string]: unknown;
}

export interface MiladyJob {
	id: string;
	name: string;
	state: string;
	data: unknown;
	created_on: string;
	completed_on: string | null;
	[key: string]: unknown;
}

export interface MiladyCreateResult {
	agentId: string;
	agentName: string;
	jobId: string;
	status: string;
	nodeId: string;
	message: string;
}

export interface MiladyJobResult {
	jobId: string;
	status: string;
	message: string;
}

// ─── Client ───────────────────────────────────────────────────────

export interface MiladyClientConfig {
	baseUrl: string;
	jwtSecret?: string | undefined;
	apiKey?: string | undefined;
	logger?: Logger | undefined;
	/** Service-account user ID in milady-cloud (created lazily). */
	serviceUserId?: string | undefined;
}

export class MiladyClient {
	private readonly baseUrl: string;
	private readonly jwtSecret: Uint8Array;
	private cachedToken: string | null = null;
	private tokenExpiresAt = 0;

	constructor(private readonly config: MiladyClientConfig) {
		this.baseUrl = config.baseUrl.replace(/\/+$/, "");
		this.jwtSecret = new TextEncoder().encode(config.jwtSecret ?? "");
	}

	/**
	 * Generate a service-account JWT compatible with milady-cloud's
	 * `validateAuth` middleware. Signs with HS256 and includes `userId`.
	 */
	private async getServiceToken(): Promise<string> {
		if (!this.config.jwtSecret) {
			throw new MiladyCloudNotConfiguredError("MILADY_JWT_SECRET is not configured");
		}

		const now = Math.floor(Date.now() / 1000);

		if (this.cachedToken && this.tokenExpiresAt - now > 60) {
			return this.cachedToken;
		}

		const expiresIn = 3600;
		const serviceUserId = this.config.serviceUserId ?? "waifu-core-service";

		const token = await new jose.SignJWT({
			userId: serviceUserId,
			email: "service@waifu.fun",
			tier: "admin",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt(now)
			.setExpirationTime(now + expiresIn)
			.sign(this.jwtSecret);

		this.cachedToken = token;
		this.tokenExpiresAt = now + expiresIn;

		return token;
	}

	private async request<T>(
		method: string,
		path: string,
		options?: {
			body?: unknown;
			authenticated?: boolean;
			asUserId?: string;
		},
	): Promise<T> {
		if (!this.baseUrl) {
			throw new MiladyCloudNotConfiguredError();
		}

		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		const needsAuth = options?.authenticated !== false;

		if (needsAuth) {
			if (this.config.apiKey !== undefined) {
				headers.authorization = `Bearer ${this.config.apiKey}`;
			} else {
				const token = options?.asUserId ? await this.generateUserToken(options.asUserId) : await this.getServiceToken();
				headers.authorization = `Bearer ${token}`;
			}
		}

		const fetchOptions: RequestInit = {
			method,
			headers,
		};

		if (options?.body !== undefined) {
			fetchOptions.body = JSON.stringify(options.body);
		}

		const res = await fetch(url, fetchOptions);

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			const message = `milady-cloud ${method} ${path}: ${res.status} ${text}`;
			const meta = { status: res.status, method, path, body: text };
			if (res.status === 404 || res.status >= 500) {
				this.config.logger?.error?.(message, meta);
			} else {
				this.config.logger?.warn?.(message, meta);
			}
			throw new MiladyApiError(res.status, message, { method, path });
		}

		if (res.status === 204) {
			return undefined as T;
		}

		const contentType = res.headers.get("content-type") ?? "";
		if (contentType.includes("text/event-stream")) {
			return (await res.text()) as unknown as T;
		}

		const json = (await res.json()) as { success?: boolean; data?: T; error?: string } | T;

		if (typeof json !== "object" || json === null || !("success" in json)) {
			return json as T;
		}

		if (!json.success) {
			throw new MiladyApiError(res.status, json.error ?? "Unknown milady-cloud error", {
				method,
				path,
			});
		}

		return json.data as T;
	}

	private async generateUserToken(userId: string): Promise<string> {
		if (!this.config.jwtSecret) {
			throw new MiladyCloudNotConfiguredError("MILADY_JWT_SECRET is not configured");
		}

		const now = Math.floor(Date.now() / 1000);
		return new jose.SignJWT({
			userId,
			email: `${userId}@waifu.fun`,
			tier: "user",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt(now)
			.setExpirationTime(now + 3600)
			.sign(this.jwtSecret);
	}

	// ── Public API ──────────────────────────────────────────────────

	async getAvailability(): Promise<MiladyAvailability> {
		return this.request<MiladyAvailability>("GET", "/api/availability", {
			authenticated: false,
		});
	}

	async createAgent(userId: string, data: CreateAgentInput): Promise<MiladyCreateResult> {
		return this.request<MiladyCreateResult>("POST", "/api/agents", {
			body: data,
			asUserId: userId,
		});
	}

	/** Compatibility alias for the W3.7 webhook bridge. */
	async provisionAgent(input: ProvisionAgentInput): Promise<MiladyCreateResult> {
		return this.createAgent(input.agentId, {
			agentName: input.agentId,
			agentConfig: {
				personaId: input.spec.personaId,
				xHandle: input.spec.xHandle,
				taxConfig: input.spec.taxConfig,
				safeAddress: input.spec.safeAddress,
			},
		});
	}

	async getAgents(userId: string): Promise<MiladyAgent[]> {
		return this.request<MiladyAgent[]>("GET", "/api/agents", {
			asUserId: userId,
		});
	}

	async getAgent(userId: string, agentId: string): Promise<MiladyAgent> {
		return this.request<MiladyAgent>("GET", `/api/agents/${agentId}`, {
			asUserId: userId,
		});
	}

	async getJobStatus(jobId: string): Promise<MiladyJob> {
		return this.request<MiladyJob>("GET", `/api/jobs/${jobId}`);
	}

	async deleteAgent(userId: string, agentId: string): Promise<MiladyJobResult> {
		return this.request<MiladyJobResult>("DELETE", `/api/agents/${agentId}`, {
			asUserId: userId,
		});
	}

	async restartAgent(userId: string, agentId: string): Promise<MiladyJobResult> {
		return this.request<MiladyJobResult>("POST", `/api/agents/${agentId}/restart`, {
			asUserId: userId,
		});
	}

	async pauseAgent(agentId: string): Promise<MiladyJobResult> {
		return this.request<MiladyJobResult>("POST", `/api/agents/${encodeURIComponent(agentId)}/pause`);
	}

	async resumeAgent(agentId: string): Promise<MiladyJobResult> {
		return this.request<MiladyJobResult>("POST", `/api/agents/${encodeURIComponent(agentId)}/resume`);
	}

	async deprovisionAgent(agentId: string): Promise<MiladyJobResult> {
		return this.request<MiladyJobResult>("DELETE", `/api/agents/${encodeURIComponent(agentId)}`);
	}

	async topUpCredits(agentId: string, amount: number): Promise<void> {
		await this.request<void>("POST", `/api/agents/${encodeURIComponent(agentId)}/credits`, {
			body: { amount },
		});
	}

	async getAgentLogs(userId: string, agentId: string, tail = 100): Promise<string> {
		return this.request<string>("GET", `/api/agents/${agentId}/logs?tail=${tail}`, {
			asUserId: userId,
		});
	}
}

export interface MiladyCloudClient {
	provisionAgent(input: ProvisionAgentInput): Promise<MiladyCreateResult | { containerId: string }>;
	pauseAgent(agentId: string): Promise<unknown>;
	resumeAgent(agentId: string): Promise<unknown>;
	deprovisionAgent(agentId: string): Promise<unknown>;
	topUpCredits(agentId: string, amount: number): Promise<void>;
}

// ─── Error classes ────────────────────────────────────────────────

export class MiladyApiError extends Error {
	readonly method: string | undefined;
	readonly path: string | undefined;

	constructor(
		public readonly status: number,
		message: string,
		opts: { method?: string; path?: string } = {},
	) {
		super(message);
		this.name = "MiladyApiError";
		this.method = opts.method;
		this.path = opts.path;
	}
}

export const MiladyCloudError = MiladyApiError;

export class MiladyCloudNotConfiguredError extends Error {
	constructor(message = "MILADY_CLOUD_BASE_URL is not configured") {
		super(message);
		this.name = "MiladyCloudNotConfiguredError";
	}
}

// ─── Singleton factory ────────────────────────────────────────────

let _instance: MiladyClient | null = null;

export function getMiladyClient(): MiladyClient {
	if (!_instance) {
		const baseUrl = process.env.MILADY_API_URL ?? "http://localhost:3000";
		const jwtSecret = process.env.MILADY_JWT_SECRET;

		if (!jwtSecret) {
			throw new Error("MILADY_JWT_SECRET env var is required for the agent bridge");
		}

		_instance = new MiladyClient({ baseUrl, jwtSecret });
	}

	return _instance;
}

export function createMiladyCloudClient(opts: {
	baseUrl: string;
	apiKey: string;
	logger: Logger;
}): MiladyCloudClient {
	return new MiladyClient({
		baseUrl: opts.baseUrl.trim().replace(/\/+$/, ""),
		apiKey: opts.apiKey,
		logger: opts.logger,
	});
}
