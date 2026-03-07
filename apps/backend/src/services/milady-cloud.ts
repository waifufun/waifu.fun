type LaunchType = "native" | "imported";
type BillingMode = "owner_credits" | "waifu_treasury_subsidy" | "hybrid";

type RequestOptions<T> = {
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: unknown;
	defaultValue?: T;
};

export type ProvisionAgentParams = {
	tokenContractAddress: string;
	chain: string;
	chainId: number;
	tokenName: string;
	tokenTicker: string;
	launchType: LaunchType;
	character?: {
		name: string;
		bio?: string;
		avatar?: string;
		config?: Record<string, unknown>;
	};
	billing?: {
		mode: BillingMode;
		initialReserveUsd?: number;
	};
};

export type ProvisionAgentResponse = {
	cloudAgentId: string;
	status: string;
	jobId?: string;
};

export type AgentStatusResponse = {
	status: string;
	lastHeartbeat?: string;
	bridgeUrl?: string;
	webUiUrl?: string;
	currentNode?: string;
	creditsSnapshot?: number;
	suspendedReason?: string;
};

export type SuspendAgentResponse = {
	success: boolean;
};

export type ResumeAgentResponse = {
	success: boolean;
	status: string;
};

export type RestartAgentResponse = {
	success: boolean;
	jobId?: string;
};

export type AgentUsageResponse = {
	uptimeHours: number;
	estimatedDailyBurnUsd: number;
	currentPeriodCostUsd: number;
	fundingSource: string;
};

export type HealthCheckResponse = {
	ok: boolean;
	timestamp: string;
};

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 2_000;

export class MiladyCloudClient {
	private readonly apiUrl: string;
	private readonly serviceKey: string;

	constructor(apiUrl: string, serviceKey: string) {
		if (!apiUrl?.trim()) {
			throw new Error("MILADY_CLOUD_API_URL is required");
		}

		if (!serviceKey?.trim()) {
			throw new Error("MILADY_CLOUD_SERVICE_KEY is required");
		}

		this.apiUrl = apiUrl.replace(/\/+$/, "");
		this.serviceKey = serviceKey;
	}

	async provisionAgent(params: ProvisionAgentParams): Promise<ProvisionAgentResponse> {
		return this.request<ProvisionAgentResponse>("/v1/agents", {
			method: "POST",
			body: params,
		});
	}

	async getAgentStatus(cloudAgentId: string): Promise<AgentStatusResponse> {
		return this.request<AgentStatusResponse>(`/v1/agents/${encodeURIComponent(cloudAgentId)}/status`, {
			method: "GET",
		});
	}

	async suspendAgent(cloudAgentId: string, reason: string): Promise<SuspendAgentResponse> {
		return this.request<SuspendAgentResponse>(`/v1/agents/${encodeURIComponent(cloudAgentId)}/suspend`, {
			method: "POST",
			body: { reason },
			defaultValue: { success: true },
		});
	}

	async resumeAgent(cloudAgentId: string): Promise<ResumeAgentResponse> {
		return this.request<ResumeAgentResponse>(`/v1/agents/${encodeURIComponent(cloudAgentId)}/resume`, {
			method: "POST",
		});
	}

	async restartAgent(cloudAgentId: string): Promise<RestartAgentResponse> {
		return this.request<RestartAgentResponse>(`/v1/agents/${encodeURIComponent(cloudAgentId)}/restart`, {
			method: "POST",
			defaultValue: { success: true },
		});
	}

	async getAgentUsage(cloudAgentId: string): Promise<AgentUsageResponse> {
		return this.request<AgentUsageResponse>(`/v1/agents/${encodeURIComponent(cloudAgentId)}/usage`, {
			method: "GET",
		});
	}

	async healthCheck(): Promise<HealthCheckResponse> {
		return this.request<HealthCheckResponse>("/health", {
			method: "GET",
		});
	}

	private async request<T>(path: string, options: RequestOptions<T>): Promise<T> {
		const url = new URL(path.replace(/^\//, ""), `${this.apiUrl}/`);

		for (let attempt = 0; attempt < 2; attempt += 1) {
			let response: Response;

			try {
				response = await fetch(url, {
					method: options.method,
					headers: {
						"Content-Type": "application/json",
						"X-Service-Key": this.serviceKey,
					},
					body: options.body === undefined ? undefined : JSON.stringify(options.body),
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});
			} catch (error) {
				throw this.buildNetworkError(options.method, url, error);
			}

			if (response.status >= 500 && attempt === 0) {
				await this.delay(RETRY_DELAY_MS);
				continue;
			}

			if (!response.ok) {
				throw await this.buildHttpError(options.method, url, response);
			}

			if (response.status === 204) {
				if (options.defaultValue !== undefined) {
					return options.defaultValue;
				}

				throw new Error(`Milady Cloud ${options.method} ${url.pathname} returned no response body`);
			}

			const rawBody = await response.text();

			if (!rawBody.trim()) {
				if (options.defaultValue !== undefined) {
					return options.defaultValue;
				}

				throw new Error(`Milady Cloud ${options.method} ${url.pathname} returned an empty response body`);
			}

			try {
				return JSON.parse(rawBody) as T;
			} catch {
				throw new Error(`Milady Cloud ${options.method} ${url.pathname} returned invalid JSON`);
			}
		}

		throw new Error(`Milady Cloud ${options.method} ${url.pathname} failed after retry`);
	}

	private async buildHttpError(method: string, url: URL, response: Response): Promise<Error> {
		const rawBody = await response.text().catch(() => "");
		const detail = this.formatErrorDetail(rawBody) || response.statusText || "Request failed";

		return new Error(
			`Milady Cloud ${method} ${url.pathname} failed with ${response.status} ${response.statusText}: ${detail}`,
		);
	}

	private buildNetworkError(method: string, url: URL, error: unknown): Error {
		if (error instanceof Error) {
			return new Error(`Milady Cloud ${method} ${url.pathname} request failed: ${error.message}`);
		}

		return new Error(`Milady Cloud ${method} ${url.pathname} request failed`);
	}

	private formatErrorDetail(rawBody: string): string {
		if (!rawBody.trim()) {
			return "";
		}

		try {
			const parsed = JSON.parse(rawBody) as { message?: string; error?: string; details?: unknown };

			if (typeof parsed.message === "string" && parsed.message.trim()) {
				return parsed.message;
			}

			if (typeof parsed.error === "string" && parsed.error.trim()) {
				return parsed.error;
			}

			if (parsed.details !== undefined) {
				return JSON.stringify(parsed.details);
			}
		} catch {
			return rawBody.trim();
		}

		return rawBody.trim();
	}

	private async delay(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}
}

function getRequiredEnv(name: "MILADY_CLOUD_API_URL" | "MILADY_CLOUD_SERVICE_KEY"): string {
	const value = process.env[name];
	if (!value?.trim()) {
		throw new Error(`${name} is required`);
	}
	return value;
}

export const miladyCloud = new MiladyCloudClient(
	getRequiredEnv("MILADY_CLOUD_API_URL"),
	getRequiredEnv("MILADY_CLOUD_SERVICE_KEY"),
);
