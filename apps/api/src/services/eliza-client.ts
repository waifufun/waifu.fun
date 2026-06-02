/**
 * Eliza Cloud API client — service-account bridge.
 *
 * waifu-core acts as a gateway: the frontend never talks to eliza-cloud
 * directly. Hosted-agent provisioning uses the Eliza Cloud service API
 * (`/api/v1/agents` + `X-Service-Key`). Legacy routes remain available for
 * older deployments that still expect bearer auth or service JWTs.
 */

import * as jose from "jose";
import { type Address, isAddress } from "viem";

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
	account?: {
		primaryWalletAddress?: string | null;
		walletKeyRef?: string | null;
	};
	access?: {
		guestMinTokens?: number;
		userMinTokens?: number;
		thresholdMode?: "strict_gt";
		adminWallets?: string[];
	};
	container?: {
		imageUri?: string;
		projectName?: string;
		port?: number;
		cpu?: number;
		memory?: number;
		desiredCount?: number;
		architecture?: "arm64" | "x86_64";
		healthCheckPath?: string;
		environmentVars?: Record<string, string>;
	};
	webhookUrl?: string;
	webhookSecret?: string;
	modelDefaults?: Record<string, string>;
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
	containerId?: string;
	containerUrl?: string;
	webUiUrl?: string | null;
	characterId?: string;
	jobId?: string;
	status: string;
	walletProvisioning?: ElizaAgentWalletProvisionResult | null;
	account?: ElizaCloudAccountProvisionResult | null;
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

export interface ElizaAgentWalletProvisionResult {
	id?: string;
	address?: string;
	chainType?: "evm" | "solana" | string;
	clientAddress?: string;
	[key: string]: unknown;
}

export interface ElizaCloudAccountProvisionResult {
	primaryWalletAddress?: string | null;
	walletKeyRef?: string | null;
	organizationId?: string;
	userId?: string;
	isNewAccount?: boolean;
	initialFreeCreditsUsd?: number;
	[key: string]: unknown;
}

export interface ElizaContainer {
	id: string;
	name?: string;
	project_name?: string;
	status?: string;
	url?: string;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export interface ElizaJobResult {
	jobId: string;
	status: string;
	message: string;
}

export interface ElizaAgentRuntimeStatus {
	agentId?: string;
	cloudAgentId?: string;
	containerId?: string;
	containerUrl?: string;
	status?: string;
	webUiUrl?: string | null;
	updatedAt?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export interface ElizaCreditCheckoutResult {
	url?: string | null;
	checkoutUrl?: string | null;
	sessionId?: string | null;
	clientSecret?: string | null;
	publishableKey?: string | null;
	[key: string]: unknown;
}

export interface ElizaAppCreditBalanceResult {
	balance: number;
	totalPurchased?: number;
	totalSpent?: number;
	isLow: boolean;
	[key: string]: unknown;
}

export interface ElizaAppCreditVerifyResult {
	amount?: number;
	message?: string;
	[key: string]: unknown;
}

export interface ElizaAgentMessageInput {
	/** Hosted agent id (cloudAgentId) the message is addressed to. */
	agentId: string;
	/** Patron's message text. */
	text: string;
	/** Stable conversation id so the agent threads replies; one per patron+agent. */
	sessionId: string;
	/** Opaque sender label surfaced to the runtime (the patron). */
	senderId?: string;
}

export interface ElizaAgentMessageResult {
	/** Reply text from the agent, when the runtime answered synchronously. */
	text: string | null;
	/** The conversation id the reply belongs to. */
	sessionId: string;
	/** Raw runtime payload for callers that want more than the text. */
	raw?: unknown;
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

		const url = `${this.baseUrl}${this.normalizePath(path)}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		const needsAuth = options?.authenticated !== false;

		if (needsAuth) {
			if (this.config.serviceKey) {
				headers["X-Service-Key"] = this.config.serviceKey;
				headers["X-API-Key"] = this.config.serviceKey;
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
			signal: AbortSignal.timeout(elizaCloudRequestTimeoutMs()),
		};

		if (options?.body !== undefined) {
			fetchOptions.body = JSON.stringify(options.body);
		}

		let res: Response;
		try {
			res = await fetch(url, fetchOptions);
		} catch (err) {
			if (err instanceof DOMException && err.name === "TimeoutError") {
				const message = `eliza-cloud ${method} ${path}: timed out after ${elizaCloudRequestTimeoutMs()}ms`;
				this.config.logger?.error?.(message, { method, path, timeoutMs: elizaCloudRequestTimeoutMs() });
				throw new ElizaApiError(504, message, { method, path });
			}
			throw err;
		}

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

		return (json.data ?? (json as { agent?: unknown }).agent ?? json) as T;
	}

	private normalizePath(path: string): string {
		if (this.baseUrl.endsWith("/api/v1") && path.startsWith("/api/v1/")) {
			return path.slice("/api/v1".length);
		}
		return path;
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
		return this.request<ElizaAvailability>("GET", "/api/compat/availability", {
			authenticated: false,
		});
	}

	async createAgent(userId: string, data: CreateAgentInput): Promise<ElizaCreateResult> {
		const agent = await this.request<Record<string, unknown>>("POST", "/api/v1/app/agents", {
			body: {
				name: data.agentName,
				...(typeof data.agentConfig?.bio === "string" ? { bio: data.agentConfig.bio } : {}),
				...(data.agentConfig ? { metadata: data.agentConfig } : {}),
			},
			asUserId: userId,
		});
		const agentId = stringField(agent, "id") ?? stringField(agent, "agentId") ?? userId;
		return {
			agentId,
			agentName: stringField(agent, "name") ?? data.agentName,
			jobId: stringField(agent, "jobId") ?? "",
			status: stringField(agent, "status") ?? "created",
			nodeId: stringField(agent, "nodeId") ?? "",
			message: stringField(agent, "message") ?? "agent created",
		};
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
		const primaryWalletAddress = input.account?.primaryWalletAddress?.trim();
		if (!primaryWalletAddress) {
			throw new ElizaCloudNotConfiguredError("agent EVM wallet is required to provision a hosted Eliza Cloud agent");
		}
		if (!isAddress(primaryWalletAddress)) {
			throw new ElizaCloudNotConfiguredError("agent EVM wallet must be a valid EVM address");
		}
		const walletKeyRef = input.account?.walletKeyRef?.trim() || `steward:${input.agentId}`;
		const imageUri = input.container?.imageUri ?? process.env.ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI;
		if (!imageUri) {
			throw new ElizaCloudNotConfiguredError("ELIZA_CLOUD_WAIFU_AGENT_IMAGE_URI is required to deploy hosted agents");
		}
		const billing = input.billing ?? { mode: "owner_credits", initialReserveUsd: 5 };
		const webhookUrl = input.webhookUrl ?? defaultElizaCloudWebhookUrl();
		const webhookSecret = input.webhookSecret ?? (webhookUrl ? defaultElizaCloudWebhookSecret() : undefined);
		// Per-inference burn metering: the container needs the inference receiver
		// URL plus the shared secret so it can sign `inference.spent` webhooks.
		const inferenceWebhookUrl = defaultElizaCloudInferenceWebhookUrl();
		const inferenceWebhookSecret = webhookSecret ?? defaultElizaCloudWebhookSecret();
		const access = {
			guestMinTokens: input.access?.guestMinTokens ?? 1_000,
			userMinTokens: input.access?.userMinTokens ?? 100_000,
			adminWallets: (input.access?.adminWallets ?? []).map((wallet) => wallet.trim()).filter(Boolean),
		};
		const invalidAdminWallet = access.adminWallets.find((wallet) => !isAddress(wallet));
		if (invalidAdminWallet) {
			throw new ElizaCloudNotConfiguredError("admin wallet must be a valid EVM address");
		}
		const environmentVars = {
			// Sol conflict-resolution (#896): write BOTH the legacy and renamed agent-id
			// env vars to the same value. develop writes WAIFU_AGENT_ID; #896 renamed it to
			// ELIZA_BILLING_AGENT_ID. The eliza runtime currently reads neither, so emitting
			// both is forward-compatible regardless of which the future consumer reads.
			WAIFU_AGENT_ID: input.agentId,
			ELIZA_BILLING_AGENT_ID: input.agentId,
			TOKEN_CONTRACT_ADDRESS: input.tokenContractAddress,
			TOKEN_CHAIN: input.chain,
			TOKEN_CHAIN_ID: String(input.chainId),
			TOKEN_NAME: input.tokenName,
			TOKEN_TICKER: input.tokenTicker,
			WAIFU_BILLING_MODE: billing.mode,
			WAIFU_INITIAL_CREDIT_USD: String(billing.initialReserveUsd ?? 5),
			WAIFU_ACCESS_GUEST_MIN_TOKENS: String(access.guestMinTokens),
			WAIFU_ACCESS_USER_MIN_TOKENS: String(access.userMinTokens),
			WAIFU_ACCESS_THRESHOLD_MODE: input.access?.thresholdMode ?? "strict_gt",
			WAIFU_ACCESS_ADMIN_WALLETS: access.adminWallets.join(","),
			WAIFU_AGENT_EVM_ADDRESS: primaryWalletAddress,
			WAIFU_AGENT_EVM_KEY_REF: walletKeyRef,
			...(process.env.WAIFU_CHAT_ACCESS_JWT_SECRET
				? { WAIFU_CHAT_ACCESS_JWT_SECRET: process.env.WAIFU_CHAT_ACCESS_JWT_SECRET }
				: {}),
			...(process.env.WAIFU_CHAT_FRAME_ANCESTORS
				? { WAIFU_CHAT_FRAME_ANCESTORS: process.env.WAIFU_CHAT_FRAME_ANCESTORS }
				: {}),
			// Sol conflict-resolution (#896): keep BOTH develop's WAIFU_* webhook env vars
			// AND #896's ELIZA_BILLING_* names pointing at the same values. Forward-compatible
			// for whichever the container consumer reads.
			...(webhookUrl ? { WAIFU_WEBHOOK_URL: webhookUrl } : {}),
			...(inferenceWebhookUrl ? { WAIFU_INFERENCE_WEBHOOK_URL: inferenceWebhookUrl } : {}),
			...(inferenceWebhookSecret ? { WAIFU_WEBHOOK_SECRET: inferenceWebhookSecret } : {}),
			...(webhookUrl ? { ELIZA_BILLING_WEBHOOK_URL: webhookUrl } : {}),
			...(webhookSecret ? { ELIZA_BILLING_WEBHOOK_SECRET: webhookSecret } : {}),
			...(input.modelDefaults ?? {}),
			...(input.container?.environmentVars ?? {}),
			ELIZA_UI_ENABLE: "true",
		};

		const agent = await this.request<Record<string, unknown>>("POST", "/api/v1/agents", {
			body: {
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
					config: {
						...(input.character?.config ?? {}),
						waifuAgentId: input.agentId,
						account: { primaryWalletAddress, walletKeyRef },
					},
				},
				billing,
				account: {
					primaryWalletAddress,
					walletKeyRef,
					chainType: "evm",
				},
				access: {
					guestTokenThreshold: access.guestMinTokens,
					userTokenThreshold: access.userMinTokens,
					adminWalletAddress: access.adminWallets[0],
					roles: {
						guest: { minTokens: access.guestMinTokens, comparison: "gt" },
						user: { minTokens: access.userMinTokens, comparison: "gt" },
						admin: { wallets: access.adminWallets },
					},
				},
				container: {
					image: imageUri,
					...(input.container?.projectName ? { projectName: input.container.projectName } : {}),
					...(input.container?.port ? { port: input.container.port } : {}),
					...(input.container?.cpu ? { cpu: input.container.cpu } : {}),
					...(input.container?.memory ? { memory: input.container.memory } : {}),
					...(input.container?.desiredCount ? { desiredCount: input.container.desiredCount } : {}),
					...(input.container?.architecture ? { architecture: input.container.architecture } : {}),
					...(input.container?.healthCheckPath ? { healthCheckPath: input.container.healthCheckPath } : {}),
					env: environmentVars,
				},
				...(input.modelDefaults ? { modelDefaults: input.modelDefaults } : {}),
				...(webhookUrl ? { webhookUrl } : {}),
				...(webhookSecret ? { webhookSecret } : {}),
			},
		});
		const cloudAgentId =
			stringField(agent, "cloudAgentId") ?? stringField(agent, "agentId") ?? stringField(agent, "id") ?? input.agentId;
		const walletProvisioning = objectField(agent, "walletProvisioning");
		const account = objectField(agent, "account");
		const polling = normalizePolling(agent.polling);
		const characterId = stringField(agent, "characterId") ?? cloudAgentId;
		const jobId = stringField(agent, "jobId") ?? stringField(agent, "id") ?? cloudAgentId;
		const webUiUrl = stringField(agent, "webUiUrl");
		const containerUrl = stringField(agent, "containerUrl");
		const normalized: ElizaCloudProvisionResult = {
			agentId: input.agentId,
			cloudAgentId,
			status: stringField(agent, "status") ?? "pending",
			...(stringField(agent, "containerId") ? { containerId: stringField(agent, "containerId") as string } : {}),
			...(containerUrl ? { containerUrl } : {}),
			...(webUiUrl ? { webUiUrl } : {}),
			...(characterId ? { characterId } : {}),
			...(jobId ? { jobId } : {}),
			...(walletProvisioning ? { walletProvisioning: walletProvisioning as ElizaAgentWalletProvisionResult } : {}),
			...(account ? { account: account as ElizaCloudAccountProvisionResult } : {}),
			...(polling ? { polling } : {}),
			tokenAddress:
				stringField(agent, "token_address") ?? stringField(agent, "tokenAddress") ?? input.tokenContractAddress,
			tokenChain: stringField(agent, "token_chain") ?? stringField(agent, "tokenChain") ?? input.chain,
			tokenName: stringField(agent, "token_name") ?? stringField(agent, "tokenName") ?? input.tokenName,
			tokenTicker: stringField(agent, "token_ticker") ?? stringField(agent, "tokenTicker") ?? input.tokenTicker,
		};
		return normalized;
	}

	async provisionAgentWallet(input: {
		cloudAgentId: string;
		clientAddress: string;
		chainType?: "evm" | "solana";
	}): Promise<ElizaAgentWalletProvisionResult> {
		return this.request<ElizaAgentWalletProvisionResult>("POST", "/api/v1/user/wallets/provision", {
			body: {
				chainType: input.chainType ?? "evm",
				clientAddress: input.clientAddress,
				characterId: input.cloudAgentId,
			},
		});
	}

	async createContainer(body: Record<string, unknown>): Promise<Record<string, unknown>> {
		return this.request<Record<string, unknown>>("POST", "/api/v1/containers", { body });
	}

	async getContainer(containerId: string): Promise<ElizaContainer> {
		return this.request<ElizaContainer>("GET", `/api/v1/containers/${encodeURIComponent(containerId)}`);
	}

	async getAgentRuntimeStatus(agentId: string): Promise<ElizaAgentRuntimeStatus> {
		return this.request<ElizaAgentRuntimeStatus>("GET", `/api/v1/agents/${encodeURIComponent(agentId)}/status`);
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
		return this.request<ElizaJobResult>("POST", `/api/v1/agents/${encodeURIComponent(agentId)}/suspend`, {
			body: { reason: "waifu runtime pause" },
		});
	}

	async resumeAgent(agentId: string): Promise<ElizaJobResult> {
		return this.request<ElizaJobResult>("POST", `/api/v1/agents/${encodeURIComponent(agentId)}/resume`);
	}

	async restartHostedAgent(agentId: string): Promise<ElizaJobResult> {
		return this.request<ElizaJobResult>("POST", `/api/v1/agents/${encodeURIComponent(agentId)}/restart`);
	}

	async deprovisionAgent(agentId: string): Promise<ElizaJobResult> {
		return this.request<ElizaJobResult>("DELETE", `/api/v1/containers/${encodeURIComponent(agentId)}`);
	}

	async topUpCredits(agentId: string, amountUsd: number): Promise<ElizaCreditCheckoutResult> {
		return this.request<ElizaCreditCheckoutResult>("POST", "/api/v1/credits/checkout", {
			body: {
				credits: amountUsd,
				agent_id: agentId,
				success_url: defaultCreditSuccessUrl(agentId),
				cancel_url: defaultCreditCancelUrl(agentId),
			},
		});
	}

	async topUpAppCredits(appId: string, amountUsd: number): Promise<ElizaCreditCheckoutResult> {
		return this.request<ElizaCreditCheckoutResult>("POST", "/api/v1/app-credits/checkout", {
			body: {
				app_id: appId,
				amount: amountUsd,
				success_url: defaultCreditSuccessUrl(appId),
				cancel_url: defaultCreditCancelUrl(appId),
			},
		});
	}

	async getAppCreditBalance(appId: string): Promise<ElizaAppCreditBalanceResult> {
		return this.request<ElizaAppCreditBalanceResult>(
			"GET",
			`/api/v1/app-credits/balance?app_id=${encodeURIComponent(appId)}`,
		);
	}

	async getCreditBalance(agentId?: string): Promise<ElizaAppCreditBalanceResult> {
		const query = agentId ? `?fresh=true&agent_id=${encodeURIComponent(agentId)}` : "?fresh=true";
		const result = await this.request<Record<string, unknown>>("GET", `/api/v1/credits/balance${query}`);
		const balance = typeof result.balance === "number" ? result.balance : Number(result.balance ?? 0);
		return {
			balance: Number.isFinite(balance) ? balance : 0,
			isLow: Number.isFinite(balance) ? balance < 5 : true,
			...result,
		};
	}

	async verifyAppCreditCheckout(sessionId: string): Promise<ElizaAppCreditVerifyResult> {
		return this.request<ElizaAppCreditVerifyResult>(
			"GET",
			`/api/v1/app-credits/verify?session_id=${encodeURIComponent(sessionId)}`,
		);
	}

	async verifyCreditCheckout(sessionId: string): Promise<ElizaAppCreditVerifyResult> {
		return this.request<ElizaAppCreditVerifyResult>("POST", "/api/billing/checkout/verify", {
			body: { session_id: sessionId, from: "waifu-agent-runtime" },
		});
	}

	async getAgentLogs(userId: string, agentId: string, tail = 100): Promise<string> {
		return this.request<string>("GET", `/api/agents/${agentId}/logs?tail=${tail}`, {
			asUserId: userId,
		});
	}

	/**
	 * Send a single chat turn to a hosted agent and return its reply.
	 *
	 * waifu-core is the gateway: the browser never talks to the container
	 * directly, so the patron-authed proxy route calls this with the service
	 * key. The runtime threads replies by `sessionId`, so callers pass a stable
	 * conversation id (one per patron + agent).
	 */
	async sendAgentMessage(input: ElizaAgentMessageInput): Promise<ElizaAgentMessageResult> {
		const result = await this.request<Record<string, unknown>>(
			"POST",
			`/api/v1/agents/${encodeURIComponent(input.agentId)}/message`,
			{
				body: {
					text: input.text,
					sessionId: input.sessionId,
					...(input.senderId ? { senderId: input.senderId } : {}),
					source: "waifu-patron-chat",
				},
			},
		);
		return {
			text: extractReplyText(result),
			sessionId: stringField(result, "sessionId") ?? input.sessionId,
			raw: result,
		};
	}
}

/**
 * Pull the reply text out of a runtime message payload. Eliza Cloud has
 * shipped a couple of response shapes over time (`text`, `message`, a
 * `messages[]` array, or `{ content: { text } }`), so we read defensively
 * and fall back to null when nothing usable is present.
 */
function extractReplyText(payload: Record<string, unknown>): string | null {
	const direct = stringField(payload, "text") ?? stringField(payload, "message") ?? stringField(payload, "reply");
	if (direct) return direct;

	const content = objectField(payload, "content");
	if (content) {
		const contentText = stringField(content, "text");
		if (contentText) return contentText;
	}

	const messages = payload.messages;
	if (Array.isArray(messages) && messages.length > 0) {
		for (let i = messages.length - 1; i >= 0; i--) {
			const entry = messages[i];
			if (entry && typeof entry === "object") {
				const record = entry as Record<string, unknown>;
				const entryText = stringField(record, "text") ?? stringField(objectField(record, "content") ?? {}, "text");
				if (entryText) return entryText;
			}
		}
	}

	return null;
}

export interface ElizaCloudClient {
	provisionAgent(input: ProvisionAgentInput): Promise<ElizaCreateResult | { containerId: string }>;
	provisionWaifuAgent?(input: ProvisionWaifuCloudAgentInput): Promise<ElizaCloudProvisionResult>;
	provisionAgentWallet?(input: {
		cloudAgentId: string;
		clientAddress: string;
		chainType?: "evm" | "solana";
	}): Promise<ElizaAgentWalletProvisionResult>;
	pauseAgent(agentId: string): Promise<unknown>;
	resumeAgent(agentId: string): Promise<unknown>;
	restartHostedAgent?(agentId: string): Promise<unknown>;
	deprovisionAgent(agentId: string): Promise<unknown>;
	topUpCredits(agentId: string, amountUsd: number): Promise<ElizaCreditCheckoutResult | undefined>;
	topUpAppCredits?(appId: string, amountUsd: number): Promise<ElizaCreditCheckoutResult>;
	getCreditBalance?(agentId?: string): Promise<ElizaAppCreditBalanceResult>;
	getAppCreditBalance?(appId: string): Promise<ElizaAppCreditBalanceResult>;
	verifyCreditCheckout?(sessionId: string): Promise<ElizaAppCreditVerifyResult>;
	verifyAppCreditCheckout?(sessionId: string): Promise<ElizaAppCreditVerifyResult>;
	getAgentRuntimeStatus?(agentId: string): Promise<ElizaAgentRuntimeStatus>;
	sendAgentMessage?(input: ElizaAgentMessageInput): Promise<ElizaAgentMessageResult>;
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
		const apiKey = resolveElizaCloudApiKey();
		const jwtSecret = process.env.ELIZA_JWT_SECRET;
		const serviceUserId = nonEmpty(process.env.ELIZA_SERVICE_USER_ID);

		if (!serviceKey && !apiKey && !jwtSecret) {
			throw new Error(
				"ELIZA_CLOUD_SERVICE_KEY, ELIZAOS_CLOUD_API_KEY, ELIZA_CLOUD_API_KEY, or ELIZA_JWT_SECRET env var is required for the agent bridge",
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

export function resolveElizaCloudApiKey(): string | undefined {
	return nonEmpty(
		process.env.ELIZA_CLOUD_API_KEY ??
			process.env.ELIZAOS_CLOUD_API_KEY ??
			process.env.ELIZAOS_API_KEY ??
			process.env.ELIZACLOUD_API_KEY,
	);
}

function nonEmpty(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

const DEFAULT_ELIZA_CLOUD_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Bound every Eliza Cloud HTTP call so a hung upstream connection can never
 * stall a request handler (or the single-concurrency provisioning worker)
 * indefinitely. Tunable via WAIFU_ELIZA_CLOUD_REQUEST_TIMEOUT_MS.
 */
function elizaCloudRequestTimeoutMs(): number {
	const raw = process.env.WAIFU_ELIZA_CLOUD_REQUEST_TIMEOUT_MS?.trim();
	if (!raw) return DEFAULT_ELIZA_CLOUD_REQUEST_TIMEOUT_MS;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ELIZA_CLOUD_REQUEST_TIMEOUT_MS;
}

function defaultFrontendUrl(): string {
	return (process.env.FRONTEND_URL ?? "https://waifu.fun").replace(/\/+$/, "");
}

function defaultCreditSuccessUrl(agentId: string): string {
	const configured = nonEmpty(process.env.WAIFU_ELIZA_CREDITS_SUCCESS_URL);
	if (configured) return configured;
	return `${defaultFrontendUrl()}/admin/ops/eliza-cloud?checkout=success&agent=${encodeURIComponent(agentId)}`;
}

function defaultCreditCancelUrl(agentId: string): string {
	const configured = nonEmpty(process.env.WAIFU_ELIZA_CREDITS_CANCEL_URL);
	if (configured) return configured;
	return `${defaultFrontendUrl()}/admin/ops/eliza-cloud?checkout=cancel&agent=${encodeURIComponent(agentId)}`;
}

function defaultElizaCloudWebhookUrl(): string | undefined {
	const configured = nonEmpty(process.env.ELIZA_CLOUD_WEBHOOK_URL ?? process.env.WAIFU_ELIZA_CLOUD_WEBHOOK_URL);
	if (configured) return configured.replace(/\/+$/, "");
	const apiBase = nonEmpty(process.env.WAIFU_API_BASE_URL ?? process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL);
	if (!apiBase) return undefined;
	return `${apiBase.replace(/\/+$/, "")}/v2/webhooks/eliza-cloud/credits`;
}

/**
 * The per-inference metering webhook the hosted container POSTs `inference.spent`
 * events to. Distinct from the credits webhook above: this is the "agent pays
 * its own way" burn signal that feeds the burn rollup. Defaults to the same API
 * base with the `/inference` receiver path; override with
 * ELIZA_CLOUD_INFERENCE_WEBHOOK_URL when the receiver lives elsewhere.
 */
function defaultElizaCloudInferenceWebhookUrl(): string | undefined {
	const configured = nonEmpty(
		process.env.ELIZA_CLOUD_INFERENCE_WEBHOOK_URL ?? process.env.WAIFU_ELIZA_CLOUD_INFERENCE_WEBHOOK_URL,
	);
	if (configured) return configured.replace(/\/+$/, "");
	const apiBase = nonEmpty(process.env.WAIFU_API_BASE_URL ?? process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL);
	if (!apiBase) return undefined;
	return `${apiBase.replace(/\/+$/, "")}/v2/webhooks/eliza-cloud/inference`;
}

function defaultElizaCloudWebhookSecret(): string | undefined {
	return nonEmpty(process.env.ELIZA_CLOUD_WEBHOOK_SECRET ?? process.env.WEBHOOK_RECEIVER_SECRET);
}

function stringField(data: Record<string, unknown>, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function objectField(data: Record<string, unknown>, key: string): Record<string, unknown> | null {
	const value = data[key];
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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
