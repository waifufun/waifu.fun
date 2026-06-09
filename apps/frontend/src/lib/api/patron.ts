import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/**
 * Patron-facing break-glass control state, surfaced verbatim from the API
 * `state` object (`@waifufun/db` AgentPublicState). The EmergencyControls
 * panel reads these to decide pause-vs-resume and to lock out a killed agent.
 */
export type AgentControlState = {
	brainPaused: boolean;
	withdrawalsPaused: boolean;
	killed: boolean;
	killedAt: string | null;
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
	/** Raw control state from the API; defaults to all-false when absent. */
	controlState?: AgentControlState | undefined;
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

/**
 * Map the raw `GET /v2/agents/:token` response (the API's `AgentDetail` from
 * `@waifufun/db` agent-queries) into the patron-page `AgentDetail` shape.
 *
 * The API row and the UI type disagree on several field names + enums, and
 * casting the raw row straight to `AgentDetail` left load-bearing fields
 * (`ticker`, `status`, `runtime`) undefined. Symptoms on a freshly-launched
 * agent's patron page: `agent.ticker` renders as empty, the status pill is
 * blank, and the runtime panel can't find `cloudAgentId`/`webUiUrl`.
 *
 * Field map (raw API → UI):
 *   symbol                         → ticker
 *   status graduated|active|pending|failed → active|provisioned (UI enum)
 *   state.brainPaused/killed       → dormant|killed (override status)
 *   treasuryUsd|treasuryNavUsd     → treasuryUsd (number, default 0)
 *   avatarUrl                      → avatar
 *   twitterHandle                  → xHandle
 *   agentSafeAddress|treasuryAddress → safeAddress
 *   elizaCloudAgentId + metadata.provisioning → runtime{...}
 *
 * Mirrors the defensive `normalizeAgentEvent` adapter (waifufun#925).
 */
export function normalizeAgentDetail(raw: unknown): AgentDetail {
	if (!raw || typeof raw !== "object") {
		return {
			id: "",
			name: "",
			ticker: "",
			treasuryUsd: 0,
			dailyBurnUsd: 0,
			runwayDays: 0,
			status: "provisioned",
			lastActionAt: null,
		};
	}
	const r = raw as Record<string, unknown>;
	const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
	const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
	const rec = (v: unknown): Record<string, unknown> | null =>
		v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

	// Status: prefer the persona control-state (state.brainPaused/killed), then
	// fold the API curve status enum into the patron-page enum. The UI only
	// distinguishes provisioned|active|dormant|killed.
	const state = rec(r.state);
	const rawStatus = str(r.status);
	let status: PatronAgentStatus;
	if (state?.killed === true) status = "killed";
	else if (state?.brainPaused === true) status = "dormant";
	else if (rawStatus === "pending") status = "provisioned";
	else status = "active"; // graduated | active | failed all map to a live dashboard

	// Runtime: synthesize an eliza-cloud runtime detail from the address-keyed
	// response. The detail endpoint doesn't return a `runtime` object, but the
	// runtime panel needs cloudAgentId/webUiUrl/status to render. Pull them from
	// elizaCloudAgentId + metadata.provisioning when present.
	const metadata = rec(r.metadata);
	const provisioning = rec(metadata?.provisioning);
	const cloudAgentId = str(r.elizaCloudAgentId) ?? str(provisioning?.cloudAgentId) ?? str(provisioning?.runtimeAgentId);
	const webUiUrl = str(provisioning?.webUiUrl);
	const cloudStatus = str(provisioning?.status);
	const runtime: AgentRuntimeDetail | null = cloudAgentId
		? {
				kind: "eliza-cloud",
				cloudAgentId,
				...(cloudStatus ? { cloudStatus } : {}),
				...(webUiUrl ? { webUiUrl } : {}),
			}
		: null;

	return {
		id: str(r.agentId) ?? str(r.id) ?? str(r.tokenAddress) ?? "",
		name: str(r.name) ?? "",
		ticker: str(r.ticker) ?? str(r.symbol) ?? "",
		avatar: str(r.avatar) ?? str(r.avatarUrl) ?? null,
		treasuryUsd: num(r.treasuryUsd) ?? num(r.treasuryNavUsd) ?? 0,
		dailyBurnUsd: num(r.dailyBurnUsd) ?? num(r.monthlyBurnUsd != null ? Number(r.monthlyBurnUsd) / 30 : undefined) ?? 0,
		runwayDays: num(r.runwayDays) ?? 0,
		status,
		lastActionAt: str(r.lastActionAt) ?? null,
		xHandle: str(r.xHandle) ?? str(r.twitterHandle) ?? null,
		owner: str(r.owner) ?? str(r.ownerAddress) ?? null,
		safeAddress: str(r.safeAddress) ?? str(r.agentSafeAddress) ?? str(r.treasuryAddress) ?? null,
		description: str(r.description) ?? null,
		bio: str(r.bio) ?? null,
		tokenAddress: str(r.tokenAddress) ?? null,
		...(runtime ? { runtimeKind: runtime.kind } : {}),
		runtime,
		controlState: {
			brainPaused: state?.brainPaused === true,
			withdrawalsPaused: state?.withdrawalsPaused === true,
			killed: state?.killed === true,
			killedAt: str(state?.killedAt) ?? null,
		},
	};
}

export function useAgentDetail(agentId?: string) {
	return useQuery<AgentDetail>({
		queryKey: ["patron-agent", agentId ?? null],
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) throw new Error("missing agentId");
			const raw = await apiFetch<unknown>(`/v2/agents/${encodeURIComponent(agentId)}`);
			return normalizeAgentDetail(raw);
		},
		refetchInterval: 30_000,
		retry: 1,
	});
}

/**
 * Normalize a raw event row from `/v2/agents/:id/events` into the
 * `AgentEvent` shape the UI renders.
 *
 * The API row uses different field names than the UI type: `eventType`
 * (not `type`), `occurredAt`/`createdAt` (not `ts`), and the human text
 * lives in `data.renderedText` / `data.title` (not `summary`). Casting the
 * raw row straight to `AgentEvent` left `type`/`ts`/`summary` undefined,
 * which is how a render that does `event.type.toLowerCase()` (or similar)
 * could throw. Map every field defensively, coercing to safe strings.
 */
function normalizeAgentEvent(raw: unknown): AgentEvent | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const data = (r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {}) ?? {};
	const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

	const type = str(r.type) ?? str(r.eventType) ?? "event";
	const ts = str(r.ts) ?? str(r.occurredAt) ?? str(r.createdAt) ?? str(r.processedAt);
	const summary = str(r.summary) ?? str(data.renderedText) ?? str(data.title);
	const id = str(r.id) ?? str(r.sourceEventId) ?? `${type}:${ts ?? Math.random().toString(36).slice(2)}`;

	return {
		id,
		type,
		ts: ts ?? "",
		...(summary ? { summary } : {}),
		...(r.data && typeof r.data === "object" ? { data: r.data as Record<string, unknown> } : {}),
	};
}

export function useAgentEvents(agentId?: string, limit = 30) {
	return useQuery<AgentEvent[]>({
		queryKey: ["patron-agent-events", agentId ?? null, limit],
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) return [];
			const data = await apiFetch<unknown>(`/v2/agents/${encodeURIComponent(agentId)}/events?limit=${limit}`);
			const rows = Array.isArray(data)
				? data
				: data && typeof data === "object" && Array.isArray((data as { events?: unknown }).events)
					? (data as { events: unknown[] }).events
					: [];
			return rows.map(normalizeAgentEvent).filter((e): e is AgentEvent => e !== null);
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

/**
 * Resurrect a dormant agent by purchasing inference credits.
 *
 * Posts to `POST /v2/agents/:id/resurrect` with `creditsAmount` in USD cents.
 * The API routes that to Eliza Cloud's credit-purchase flow (which returns a
 * Stripe checkout). IMPORTANT: today this initiates a credit purchase; it is
 * NOT funded by the agent's on-chain Safe treasury. The BNB->credits bridge
 * that would let on-chain treasury funding wake the brain is designed but not
 * yet shipped (see BNB-CREDITS-BRIDGE-DESIGN-2026-06-03). Surface this path
 * honestly as "add inference credits", distinct from "fund treasury".
 */
export type ResurrectResult = {
	ok?: boolean;
	agentId?: string;
	creditsAmount?: number;
	creditsUnit?: string;
	modelTier?: string;
	/** Stripe checkout URL when the credit purchase needs the patron to pay. */
	checkoutUrl?: string | null;
	url?: string | null;
};

export function useResurrectAgent(agentId?: string) {
	return useMutation<ResurrectResult, ApiError, { creditsAmountCents: number }>({
		mutationFn: async ({ creditsAmountCents }) => {
			if (!agentId) throw { status: 0, message: "missing agentId" } as ApiError;
			return apiFetch<ResurrectResult>(`/v2/agents/${encodeURIComponent(agentId)}/resurrect`, {
				method: "POST",
				body: JSON.stringify({ creditsAmount: creditsAmountCents }),
			});
		},
	});
}

/**
 * Patron break-glass emergency controls. Each maps 1:1 to a patron-scoped,
 * ownership-gated mutation on the v2 API:
 *
 *   pause  → POST /v2/agents/:id/pause   (halts brain + freezes withdrawals)
 *   resume → POST /v2/agents/:id/resume  (clears the pause above)
 *   kill   → POST /v2/agents/:id/kill    (permanent, irreversible)
 *
 * Auth is the standard apiFetch path (Steward bearer + wf_session cookie).
 * On success we invalidate the agent-detail + events queries so the UI
 * reflects the new control state and the new lifecycle event immediately.
 *
 * NOTE: there is deliberately no "freeze withdrawals only" hook. The API has
 * no patron-scoped withdrawals-only route — `/pause` always pauses both brain
 * AND withdrawals. The EmergencyControls UI reflects this honestly rather than
 * faking a partial control.
 */
export type AgentControlResult = {
	ok: boolean;
	data?: {
		brainPaused: boolean;
		withdrawalsPaused: boolean;
		killed: boolean;
		killedAt: string | null;
	};
};

export type AgentControlAction = "pause" | "resume" | "kill";

type AgentControlVars = { reason?: string } | undefined;

function useAgentControlMutation(action: AgentControlAction, agentId?: string) {
	const qc = useQueryClient();
	return useMutation<AgentControlResult, ApiError, AgentControlVars>({
		mutationFn: async (vars) => {
			if (!agentId) throw { status: 0, message: "missing agentId" } as ApiError;
			const reason = vars?.reason;
			return apiFetch<AgentControlResult>(`/v2/agents/${encodeURIComponent(agentId)}/${action}`, {
				method: "POST",
				body: JSON.stringify(reason ? { reason } : {}),
			});
		},
		onSuccess: () => {
			if (!agentId) return;
			void qc.invalidateQueries({ queryKey: ["patron-agent", agentId] });
			void qc.invalidateQueries({ queryKey: ["patron-agent-events", agentId] });
		},
	});
}

export function usePauseAgent(agentId?: string) {
	return useAgentControlMutation("pause", agentId);
}

export function useResumeAgent(agentId?: string) {
	return useAgentControlMutation("resume", agentId);
}

export function useKillAgent(agentId?: string) {
	return useAgentControlMutation("kill", agentId);
}

export function formatUsd(value: number | undefined | null): string {
	if (value == null || Number.isNaN(value)) return "$0";
	const sign = value < 0 ? "-" : "";
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
	if (abs >= 10_000) return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
	return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
