/**
 * Eliza Cloud API client — service-account bridge.
 *
 * waifu-core acts as a gateway: the frontend never talks to eliza-cloud
 * directly. Hosted-agent provisioning uses the Eliza Cloud service API
 * (`/api/v1/agents` + `X-Service-Key`). Legacy routes remain available for
 * older deployments that still expect bearer auth or service JWTs.
 */

import * as jose from "jose";
import type { Address } from "viem";

// ─── Types ────────────────────────────────────────────────────────

export interface ElizaAvailability {
	totalSlots: number;
	usedSlots: number;
	availableSlots: number;
	nodes: unknown[];
}

export interface CreateAgentInput {
	agentName: string;
	agentConfig?: Record<string, unknown> | undefined;
}

export interface ProvisionWaifuCloudAgentInput {
	agentId: string;
	tokenContractAddress: string;
	chain: string;
	chainId: number;
	tokenName: string;
	tokenTicker: string;
	launchType: "native" | "imported";
	character?: {
		name: string;
		bio?: string;
		avatar?: string;
		config?: Record<string, unknown>;
	};
	billing?: {
		mode: "owner_credits" | "waifu_treasury_subsidy" | "hybrid";
		initialReserveUsd?: number;
	};
	webhookUrl?: string;
	modelDefaults?: Record<string, string>;
}

interface ElizaServiceCreateAgentBody {
	tokenContractAddress: string;
	chain: string;
	chainId: number;
	tokenName: string;
	tokenTicker: string;
	launchType: "native" | "imported";
	character: {
		name: string;
		bio?: string;
		avatar?: string;
		config: Record<string, unknown>;
	};
	billing: NonNullable<ProvisionWaifuCloudAgentInput["billing"]>;
	webhookUrl?: string;
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

export interface ElizaAgent {
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

export interface ElizaJob {
	id: string;
	name: string;
	state: string;
	data: unknown;
	created_on: string;
	completed_on: string | null;
	[key: string]: unknown;
}

export interface ElizaCreateResult {
	agentId: string;
	agentName: string;
	jobId: string;
	status: string;
	nodeId: string;
	message: string;
}

export interface ElizaCloudProvisionResult {
	agentId: string;
	cloudAgentId: string;
	characterId?: string;
	jobId?: string;
	status: string;
	polling?: {
		endpoint: string;
		intervalMs: number;
		expectedDurationMs: number;
	};
	tokenAddress?: string | null;
	tokenChain?: string | null;
	tokenName?: string | null;
	tokenTicker?: string | null;
}

export interface ElizaJobResult {
	jobId: string;
	status: string;
	message: string;
}

// ─── Client ───────────────────────────────────────────────────────

export interface ElizaClientConfig {
	baseUrl: string;
	jwtSecret?: string | undefined;
	apiKey?: string | undefined;
	serviceKey?: string | undefined;
	logger?: Logger | undefined;
	/** Service-account user ID in eliza-cloud (created lazily). */
	serviceUserId?: string | undefined;
}

export class ElizaClient {
	private readonly baseUrl: string;
	private readonly jwtSecret: Uint8Array;
	private cachedToken: string | null = null;
	private tokenExpiresAt = 0;

	constructor(private readonly config: ElizaClientConfig) {
		this.baseUrl = config.baseUrl.replace(/\/+$/, "");
		this.jwtSecret = new TextEncoder().encode(config.jwtSecret ?? "");
	}

	/**
	 * Generate a service-account JWT compatible with eliza-cloud's
	 * `validateAuth` middleware. Signs with HS256 and includes `userId`.
	 */
	private async getServiceToken(): Promise<string> {
		if (!this.config.jwtSecret) {
			throw new ElizaCloudNotConfiguredError("ELIZA_JWT_SECRET is not configured");
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
			throw new ElizaCloudNotConfiguredError();
		}

		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		const needsAuth = options?.authenticated !== false;

		if (needsAuth) {
			if (this.config.serviceKey) {
				headers["X-Service-Key"] = this.config.serviceKey;
			} else if (this.config.apiKey) {
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
			const message = `eliza-cloud ${method} ${path}: ${res.status} ${text}`;
			const meta = { status: res.status, method, path, body: text };
			if (res.status === 404 || res.status >= 500) {
				this.config.logger?.error?.(message, meta);
			} else {
				this.config.logger?.warn?.(message, meta);
			}
			throw new ElizaApiError(res.status, message, { method, path });
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
			throw new ElizaApiError(res.status, json.error ?? "Unknown eliza-cloud error", {
				method,
				path,
			});
		}

		return json.data as T;
	}

	private async generateUserToken(userId: string): Promise<string> {
		if (!this.config.jwtSecret) {
			throw new ElizaCloudNotConfiguredError("ELIZA_JWT_SECRET is not configured");
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

	async getAvailability(): Promise<ElizaAvailability> {
		return this.request<ElizaAvailability>("GET", "/api/availability", {
			authenticated: false,
		});
	}

	async createAgent(userId: string, data: CreateAgentInput): Promise<ElizaCreateResult> {
		return this.request<ElizaCreateResult>("POST", "/api/agents", {
			body: data,
			asUserId: userId,
		});
	}

	/** Compatibility alias for the W3.7 webhook bridge. */
	async provisionAgent(input: ProvisionAgentInput): Promise<ElizaCreateResult> {
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

	async provisionWaifuAgent(input: ProvisionWaifuCloudAgentInput): Promise<ElizaCloudProvisionResult> {
		const characterConfig = {
			...(input.character?.config ?? {}),
			waifuAgentId: input.agentId,
			...(input.modelDefaults ? { modelDefaults: input.modelDefaults, settings: input.modelDefaults } : {}),
		};
		const body: ElizaServiceCreateAgentBody = {
			tokenContractAddress: input.tokenContractAddress,
			chain: input.chain,
			chainId: input.chainId,
			tokenName: input.tokenName,
			tokenTicker: input.tokenTicker,
			launchType: input.launchType,
			character: {
				name: input.character?.name ?? input.tokenName,
				...(input.character?.bio ? { bio: input.character.bio } : {}),
				...(input.character?.avatar ? { avatar: input.character.avatar } : {}),
				config: characterConfig,
			},
			billing: input.billing ?? { mode: "owner_credits" },
			...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
		};

		const result = await this.request<Record<string, unknown>>("POST", "/api/v1/agents", { body });
		const cloudAgentId =
			stringField(result, "cloudAgentId") ??
			stringField(result, "agentId") ??
			stringField(result, "id") ??
			input.agentId;
		const polling = normalizePolling(result.polling);
		const characterId = stringField(result, "characterId");
		const jobId = stringField(result, "jobId");
		const normalized: ElizaCloudProvisionResult = {
			agentId: input.agentId,
			cloudAgentId,
			status: stringField(result, "status") ?? "pending",
			...(characterId ? { characterId } : {}),
			...(jobId ? { jobId } : {}),
			...(polling ? { polling } : {}),
			tokenAddress:
				stringField(result, "token_address") ??
				stringField(result, "tokenAddress") ??
				stringField(result, "tokenContractAddress"),
			tokenChain: stringField(result, "token_chain") ?? stringField(result, "tokenChain"),
			tokenName: stringField(result, "token_name") ?? stringField(result, "tokenName"),
			tokenTicker: stringField(result, "token_ticker") ?? stringField(result, "tokenTicker"),
		};
		return normalized;
	}

	async getAgents(userId: string): Promise<ElizaAgent[]> {
		return this.request<ElizaAgent[]>("GET", "/api/agents", {
			asUserId: userId,
		});
	}

	async getAgent(userId: string, agentId: string): Promise<ElizaAgent> {
		return this.request<ElizaAgent>("GET", `/api/agents/${agentId}`, {
			asUserId: userId,
		});
	}

	async getJobStatus(jobId: string): Promise<ElizaJob> {
		return this.request<ElizaJob>("GET", `/api/jobs/${jobId}`);
	}

	async deleteAgent(userId: string, agentId: string): Promise<ElizaJobResult> {
		return this.request<ElizaJobResult>("DELETE", `/api/agents/${agentId}`, {
			asUserId: userId,
		});
	}

	async restartAgent(userId: string, agentId: string): Promise<ElizaJobResult> {
		return this.request<ElizaJobResult>("POST", `/api/agents/${agentId}/restart`, {
			asUserId: userId,
		});
	}

	async pauseAgent(agentId: string): Promise<ElizaJobResult> {
		return this.request<ElizaJobResult>("POST", `/api/agents/${encodeURIComponent(agentId)}/pause`);
	}

	async resumeAgent(agentId: string): Promise<ElizaJobResult> {
		return this.request<ElizaJobResult>("POST", `/api/agents/${encodeURIComponent(agentId)}/resume`);
	}

	async deprovisionAgent(agentId: string): Promise<ElizaJobResult> {
		return this.request<ElizaJobResult>("DELETE", `/api/agents/${encodeURIComponent(agentId)}`);
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

export interface ElizaCloudClient {
	provisionAgent(input: ProvisionAgentInput): Promise<ElizaCreateResult | { containerId: string }>;
	provisionWaifuAgent?(input: ProvisionWaifuCloudAgentInput): Promise<ElizaCloudProvisionResult>;
	pauseAgent(agentId: string): Promise<unknown>;
	resumeAgent(agentId: string): Promise<unknown>;
	deprovisionAgent(agentId: string): Promise<unknown>;
	topUpCredits(agentId: string, amount: number): Promise<void>;
}

// ─── Error classes ────────────────────────────────────────────────

export class ElizaApiError extends Error {
	readonly method: string | undefined;
	readonly path: string | undefined;

	constructor(
		public readonly status: number,
		message: string,
		opts: { method?: string; path?: string } = {},
	) {
		super(message);
		this.name = "ElizaApiError";
		this.method = opts.method;
		this.path = opts.path;
	}
}

export const ElizaCloudError = ElizaApiError;

export class ElizaCloudNotConfiguredError extends Error {
	constructor(message = "Eliza Cloud client is not configured") {
		super(message);
		this.name = "ElizaCloudNotConfiguredError";
	}
}

// ─── Singleton factory ────────────────────────────────────────────

let _instance: ElizaClient | null = null;

export function getElizaClient(): ElizaClient {
	if (!_instance) {
		const baseUrl = process.env.ELIZA_CLOUD_BASE_URL ?? process.env.ELIZA_API_URL ?? "https://elizacloud.ai";
		const serviceKey = nonEmpty(process.env.ELIZA_CLOUD_SERVICE_KEY ?? process.env.ELIZA_SERVICE_KEY);
		const apiKey = nonEmpty(process.env.ELIZA_CLOUD_API_KEY);
		const jwtSecret = process.env.ELIZA_JWT_SECRET;
		const serviceUserId = nonEmpty(process.env.ELIZA_SERVICE_USER_ID);

		if (!serviceKey && !apiKey && !jwtSecret) {
			throw new Error(
				"ELIZA_CLOUD_SERVICE_KEY, ELIZA_CLOUD_API_KEY, or ELIZA_JWT_SECRET env var is required for the agent bridge",
			);
		}

		_instance = new ElizaClient({ baseUrl, serviceKey, apiKey, jwtSecret, serviceUserId });
	}

	return _instance;
}

export function createElizaCloudClient(opts: {
	baseUrl: string;
	apiKey?: string;
	serviceKey?: string;
	logger: Logger;
}): ElizaCloudClient {
	return new ElizaClient({
		baseUrl: opts.baseUrl.trim().replace(/\/+$/, ""),
		apiKey: nonEmpty(opts.apiKey),
		serviceKey: nonEmpty(opts.serviceKey),
		logger: opts.logger,
	});
}

function nonEmpty(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizePolling(value: unknown): ElizaCloudProvisionResult["polling"] | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const endpoint = stringField(record, "endpoint");
	const intervalMs = typeof record.intervalMs === "number" ? record.intervalMs : null;
	const expectedDurationMs = typeof record.expectedDurationMs === "number" ? record.expectedDurationMs : null;
	if (!endpoint || intervalMs === null || expectedDurationMs === null) return null;
	return { endpoint, intervalMs, expectedDurationMs };
}
