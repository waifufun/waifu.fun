import { useMutation, useQuery } from "@tanstack/react-query";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

/**
 * Patron-facing agent summary. Shape mirrors what the v2 API is expected
 * to return from `GET /v2/agents?owner=<address>`.
 *
 * TODO: replace with generated types from `@autofun/types` once the backend
 * contract is locked in.
 */
export type PatronAgentStatus = "provisioned" | "active" | "dormant" | "killed";

export type PatronAgent = {
	id: string;
	name: string;
	ticker: string;
	avatar?: string | null;
	treasuryUsd: number;
	dailyBurnUsd: number;
	runwayDays: number;
	status: PatronAgentStatus;
	lastActionAt: string | null;
	xHandle?: string | null;
	owner?: string | null;
	safeAddress?: string | null;
};

export type AgentEvent = {
	id: string;
	type: string;
	ts: string;
	summary?: string;
	data?: Record<string, unknown>;
};

export type AgentRuntimeKind = "eliza-cloud" | "third-party-webhook" | "third-party-pull";

export type AgentRuntimeDetail = {
	kind: AgentRuntimeKind;
	/** Hosted Eliza Cloud agent identifier (eliza-cloud only) */
	cloudAgentId?: string | null;
	/** Hosted cloud status as returned by the runtime provisioner */
	cloudStatus?: string | null;
	/** Hosted cloud web UI link, when available */
	webUiUrl?: string | null;
	/** Hosted cloud logs link, when available */
	logsUrl?: string | null;
	/** absolute URL where waifu-core POSTs runtime events (third-party-webhook only) */
	webhookUrl?: string | null;
	/** masked secret. Real secret is delivered once via a separate flow. */
	webhookSecretMasked?: string | null;
	/** raw secret returned exactly once after rotation/provision (third-party-webhook only) */
	webhookSecretRaw?: string | null;
	/** raw API key returned exactly once after provision (third-party-pull only) */
	rawApiKey?: string | null;
	/** ISO timestamp the runtime API key was issued */
	apiKeyIssuedAt?: string | null;
	/** ISO timestamp of last hb_signal received from the agent */
	lastHb_signalAt?: string | null;
	/** v2 endpoint paths surfaced to the UI for code snippets */
	hb_signalEndpoint?: string | null;
	eventsPullEndpoint?: string | null;
};

export type AgentDetail = PatronAgent & {
	description?: string | null;
	bio?: string | null;
	publicPageUrl?: string | null;
	treasurySeries?: { ts: string; valueUsd: number }[];
	treasuryDelta7d?: number;
	adapters?: AgentAdapter[];
	launchId?: string | null;
	tokenAddress?: string | null;
	runtimeKind?: AgentRuntimeKind;
	runtime?: AgentRuntimeDetail | null;
};

export type AgentAdapter = {
	id: string;
	name: string;
	enabled: boolean;
	description?: string;
};

/**
 * Fetch the agents owned by a patron wallet.
 *
 * The endpoint may not exist yet; in that case the hook surfaces the error
 * and the UI falls back to an empty/error state. We deliberately avoid any
 * mock fallback so we can see real integration issues in staging.
 */
/**
 * Fetch agents owned by the current authed patron (any auth method).
 *
 * If `owner` is supplied (wallet address), uses ?owner=<address> for
 * back-compat with the wallet-centric flow. Otherwise calls
 * ?mine=true which the backend resolves via the wf_session cookie.
 */
export function usePatronAgents(owner?: string) {
	return useQuery<PatronAgent[]>({
		queryKey: ["patron-agents", owner ?? "mine"],
		queryFn: async () => {
			const url = owner ? `/v2/agents?owner=${encodeURIComponent(owner)}` : "/v2/agents?mine=true";
			const data = await apiFetch<unknown>(url);
			// Accept either a bare array or `{ agents: [...] }` shape.
			if (Array.isArray(data)) return data as PatronAgent[];
			if (data && typeof data === "object" && Array.isArray((data as { agents?: unknown }).agents)) {
				return (data as { agents: PatronAgent[] }).agents;
			}
			return [];
		},
		refetchInterval: 60_000,
		retry: 1,
	});
}

export function useAgentDetail(agentId?: string) {
	return useQuery<AgentDetail>({
		queryKey: ["patron-agent", agentId ?? null],
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) throw new Error("missing agentId");
			return apiFetch<AgentDetail>(`/v2/agents/${encodeURIComponent(agentId)}`);
		},
		refetchInterval: 30_000,
		retry: 1,
	});
}

export function useAgentEvents(agentId?: string, limit = 30) {
	return useQuery<AgentEvent[]>({
		queryKey: ["patron-agent-events", agentId ?? null, limit],
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) return [];
			const data = await apiFetch<unknown>(`/v2/agents/${encodeURIComponent(agentId)}/events?limit=${limit}`);
			if (Array.isArray(data)) return data as AgentEvent[];
			if (data && typeof data === "object" && Array.isArray((data as { events?: unknown }).events)) {
				return (data as { events: AgentEvent[] }).events;
			}
			return [];
		},
		refetchInterval: 20_000,
		retry: 1,
	});
}

/**
 * Send one chat turn to the hosted agent through the patron-authed proxy
 * (`POST /v2/agents/:id/chat`). The API verifies the caller is the patron and
 * owner of the agent before forwarding to the runtime, so this hook is the
 * only sanctioned way for the dashboard to talk to the agent.
 */
export type AgentChatReply = {
	ok: boolean;
	sessionId: string;
	reply: string | null;
	sentAt: string;
};

export type AgentChatErrorState = "provisioning" | "dormant" | "killed" | "unconfigured" | "forbidden" | "error";

export function chatErrorState(err: unknown): AgentChatErrorState {
	if (!isApiError(err)) return "error";
	// apiFetch maps `code` from a `code` field and `message` from `error || message`.
	// The chat route sends both, but read either so the classification holds even
	// if only one is present.
	const signal = (err as ApiError).code ?? err.message;
	if (signal === "AGENT_NOT_RUNNING") return "provisioning";
	if (signal === "AGENT_DORMANT") return "dormant";
	if (signal === "AGENT_KILLED") return "killed";
	if (signal === "CHAT_NOT_CONFIGURED") return "unconfigured";
	if (err.status === 403) return "forbidden";
	return "error";
}

export function useAgentChat(agentId?: string) {
	return useMutation<AgentChatReply, ApiError, { text: string; sessionId?: string }>({
		mutationFn: async ({ text, sessionId }) => {
			if (!agentId) throw { status: 0, message: "missing agentId" } as ApiError;
			return apiFetch<AgentChatReply>(`/v2/agents/${encodeURIComponent(agentId)}/chat`, {
				method: "POST",
				body: JSON.stringify({ text, ...(sessionId ? { sessionId } : {}) }),
			});
		},
	});
}

export function formatUsd(value: number | undefined | null): string {
	if (value == null || Number.isNaN(value)) return "$0";
	const sign = value < 0 ? "-" : "";
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
	if (abs >= 10_000) return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
	return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
