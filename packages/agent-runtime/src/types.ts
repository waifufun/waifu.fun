export type RuntimeKind = "eliza-cloud" | "third-party-webhook" | "third-party-pull";

export interface RuntimeAdapter {
	readonly kind: RuntimeKind;
	provision(opts: ProvisionOptions): Promise<ProvisionResult>;
	dispatchEvent(agentId: string, event: AgentEventPayload): Promise<void>;
	pause(agentId: string): Promise<void>;
	resume(agentId: string): Promise<void>;
	deprovision(agentId: string): Promise<void>;
	checkHealth(agentId: string): Promise<RuntimeHealth>;
}

export interface ProvisionOptions {
	agentId: string;
	agentName: string;
	persona: { name: string; bio: string; image?: string; promptTemplate?: string };
	safeAddress: string | null;
	xHandle: string | null;
	tokenAddress?: string | null;
	chain?: string | null;
	chainId?: number | null;
	tokenName?: string | null;
	tokenTicker?: string | null;
	launchType?: "native" | "imported" | null;
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
	webhookUrl?: string;
	webhookSecret?: string;
	apiKey?: string;
	modelDefaults?: Record<string, string>;
}

export interface ProvisionResult {
	containerId?: string;
	runtimeAgentId: string;
	containerUrl?: string;
	webUiUrl?: string;
	livenessCheckUrl?: string;
	runtimeWebhookSecretHash?: string;
	runtimeApiKey?: string;
	runtimeApiKeyHash?: string;
}

export interface AgentEventPayload {
	eventType: string;
	agentId: string | null;
	data: Record<string, unknown>;
	timestamp: string;
	eventId: string;
}

export interface RuntimeHealth {
	online: boolean;
	lastSeenAt: Date | null;
	latencyMs?: number;
	error?: string;
}
