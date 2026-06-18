/**
 * Agent provisioning client (W7.1 stub).
 *
 * Calls `POST /v2/agents/provision` (coming in W7.2 backend wave).
 * If the endpoint is missing (404 or network error) we surface a typed
 * "not_wired" result so the UI can fall through to a friendly stub flow
 * with localStorage persistence intact.
 */

import type { ChainId, LaunchpadFeeConfig, LaunchpadId } from "@/lib/launchpad/types";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";
import { normalizeAgentDetail } from "./patron";

export type ProvisionRequest = {
	/**
	 * Invite code captured in step-persona. Backend currently silently drops
	 * unknown fields; forward-looking for invite-code validation.
	 */
	inviteCode: string;
	persona: {
		name: string;
		ticker: string;
		bio: string;
		personaPrompt: string;
		avatarTemplateId: string | null;
		hasAvatarUpload: boolean;
	};
	runtime: {
		kind: "hosted" | "webhook" | "pull";
		webhookUrl?: string;
		webhookSecret?: string;
	};
	safe: {
		taxAgentBps: number;
		taxPatronBps: number;
		owners: string[];
		threshold: number;
		firstBuyFundingSource: string | null;
		adapters: Array<{ slug: "pancake" | "venus"; enabled: boolean }>;
	};
	launchpad?: {
		launchpad_id: LaunchpadId;
		chain: ChainId;
		launchpad_config: LaunchpadFeeConfig;
		fee_mode: "production";
		fees_can_be_disabled: false;
	};
};

export type ProvisionResult =
	| {
			ok: true;
			agentId: string;
			tokenAddress?: string;
			safeAddress?: string;
			pullApiKey?: string | null;
			agentApiKey?: string | null;
			cloudAgentId?: string;
			cloudStatus?: string;
			provisioningJobId?: string;
			webUiUrl?: string;
			logsUrl?: string;
			/**
			 * True when the backend returned 202 + `status: 'provisioning'` — the
			 * hosted runtime is being provisioned ASYNC by the worker and the caller
			 * should poll `fetchProvisioningStatus(agentId)` for readiness. Absent
			 * (or false) for the synchronous 200 duplicate-recovery path, which
			 * already carries a final cloud status.
			 */
			asyncProvisioning?: boolean;
	  }
	| {
			ok: false;
			reason: "not_wired" | "validation" | "server" | "network";
			message: string;
	  };

type ProvisionWizardState = {
	inviteCode: string;
	persona: {
		name: string;
		ticker: string;
		bio: string;
		personaPrompt: string;
		avatarTemplateId: string | null;
		avatarDataUrl: string | null;
	};
	safe: {
		taxAgentBps: number;
		taxPatronBps: number;
		owners?: string[];
		threshold?: number;
		firstBuyFundingSource?: string | null;
		adapters: { pancake: boolean; venus: boolean };
	};
	launchpad: {
		selectedId: LaunchpadId | null;
		selectedChain: ChainId | null;
		feeConfig: LaunchpadFeeConfig | null;
	};
};

type BuildProvisionPayloadOptions = {
	launchpadPickerEnabled?: boolean;
};

const LAUNCHPAD_PICKER_FLAG = process.env.NEXT_PUBLIC_LAUNCHPAD_PICKER_ENABLED === "true";

const FALLBACK_CHAIN_BY_LAUNCHPAD: Record<LaunchpadId, ChainId> = {
	"four-meme-regular": "bsc",
	"four-meme-tax": "bsc",
	flap: "bsc",
	bankr: "base",
	meteora: "solana",
	"pump-fun": "solana",
	bags: "solana",
	"custom-evm": "ethereum",
};

export function buildProvisionPayload(
	state: ProvisionWizardState,
	options: BuildProvisionPayloadOptions = {},
): ProvisionRequest {
	const launchpadPickerEnabled = options.launchpadPickerEnabled ?? LAUNCHPAD_PICKER_FLAG;
	const base: ProvisionRequest = {
		inviteCode: state.inviteCode.trim(),
		persona: {
			name: state.persona.name.trim(),
			ticker: state.persona.ticker.trim(),
			bio: state.persona.bio.trim(),
			personaPrompt: state.persona.personaPrompt.trim(),
			avatarTemplateId: state.persona.avatarTemplateId,
			hasAvatarUpload: Boolean(state.persona.avatarDataUrl),
		},
		runtime: { kind: "hosted" },
		safe: {
			taxAgentBps: state.safe.taxAgentBps,
			taxPatronBps: state.safe.taxPatronBps,
			owners: state.safe.owners ?? [],
			threshold: state.safe.threshold ?? 1,
			firstBuyFundingSource: state.safe.firstBuyFundingSource ?? null,
			adapters: [
				{ slug: "pancake", enabled: state.safe.adapters.pancake },
				{ slug: "venus", enabled: state.safe.adapters.venus },
			],
		},
	};

	if (!launchpadPickerEnabled || !state.launchpad.selectedId || !state.launchpad.feeConfig) {
		return base;
	}

	return {
		...base,
		launchpad: {
			launchpad_id: state.launchpad.selectedId,
			chain: state.launchpad.selectedChain ?? FALLBACK_CHAIN_BY_LAUNCHPAD[state.launchpad.selectedId],
			launchpad_config: state.launchpad.feeConfig,
			fee_mode: "production",
			fees_can_be_disabled: false,
		},
	};
}

export async function provisionAgent(payload: ProvisionRequest, signal?: AbortSignal): Promise<ProvisionResult> {
	let data: unknown;
	try {
		const init: RequestInit = {
			method: "POST",
			body: JSON.stringify(payload),
		};
		if (signal) init.signal = signal;
		data = await apiFetch<unknown>("/v2/agents/provision", init);
	} catch (err) {
		if (isApiError(err)) {
			const apiErr = err as ApiError;
			if (apiErr.status === 404) {
				return { ok: false, reason: "not_wired", message: "Provision endpoint not deployed yet" };
			}
			if (apiErr.status === 400 || apiErr.status === 422) {
				return { ok: false, reason: "validation", message: apiErr.message || `validation failed (${apiErr.status})` };
			}
			return { ok: false, reason: "server", message: apiErr.message || `server error (${apiErr.status})` };
		}
		const message = err instanceof Error ? err.message : "network error";
		return { ok: false, reason: "network", message };
	}

	if (typeof data !== "object" || data === null) {
		return { ok: false, reason: "server", message: "unexpected payload" };
	}

	const obj = data as Record<string, unknown>;
	const agentId = typeof obj.agentId === "string" ? obj.agentId : typeof obj.id === "string" ? obj.id : null;
	if (!agentId) {
		return { ok: false, reason: "server", message: "no agentId in response" };
	}

	// The 202 async path sets a top-level `status: 'provisioning'`. The 200
	// duplicate-recovery path never does (it returns a final cloud status under
	// `cloudStatus`/`cloud.status`). Use the top-level field as the discriminator.
	const asyncProvisioning = obj.status === "provisioning";

	const tokenAddress = typeof obj.tokenAddress === "string" ? obj.tokenAddress : undefined;
	const safeAddress = typeof obj.safeAddress === "string" ? obj.safeAddress : undefined;
	const pullApiKey = typeof obj.pullApiKey === "string" ? obj.pullApiKey : obj.pullApiKey === null ? null : undefined;
	const agentApiKey =
		typeof obj.agentApiKey === "string" ? obj.agentApiKey : obj.agentApiKey === null ? null : undefined;
	const cloudAgentId = typeof obj.cloudAgentId === "string" ? obj.cloudAgentId : undefined;
	const cloudStatus =
		typeof obj.cloudStatus === "string" ? obj.cloudStatus : typeof obj.status === "string" ? obj.status : undefined;
	const provisioningJobId =
		typeof obj.provisioningJobId === "string"
			? obj.provisioningJobId
			: typeof obj.cloudJobId === "string"
				? obj.cloudJobId
				: typeof obj.jobId === "string"
					? obj.jobId
					: undefined;
	const webUiUrl = typeof obj.webUiUrl === "string" ? obj.webUiUrl : undefined;
	const logsUrl = typeof obj.logsUrl === "string" ? obj.logsUrl : undefined;

	const result: ProvisionResult = {
		ok: true,
		agentId,
		...(tokenAddress !== undefined ? { tokenAddress } : {}),
		...(safeAddress !== undefined ? { safeAddress } : {}),
		...(pullApiKey !== undefined ? { pullApiKey } : {}),
		...(agentApiKey !== undefined ? { agentApiKey } : {}),
		...(cloudAgentId !== undefined ? { cloudAgentId } : {}),
		...(cloudStatus !== undefined ? { cloudStatus } : {}),
		...(provisioningJobId !== undefined ? { provisioningJobId } : {}),
		...(webUiUrl !== undefined ? { webUiUrl } : {}),
		...(logsUrl !== undefined ? { logsUrl } : {}),
		...(asyncProvisioning ? { asyncProvisioning } : {}),
	};
	return result;
}

/** A single read of the hosted runtime's provisioning state, used by the
 * wizard's post-202 poll loop. `cloudStatus` is the raw Eliza Cloud status the
 * worker writes into `metadata.provisioning.status` (e.g. 'provisioning',
 * 'pending', 'queued', 'running', 'failed'). */
export type ProvisioningStatusSnapshot = {
	cloudStatus: string | null;
	webUiUrl: string | null;
	/** Terminal-ready: the hosted container is up and chat-reachable. */
	ready: boolean;
	/** Terminal-failed: Eliza Cloud reported a non-recoverable failure. */
	failed: boolean;
};

const RUNTIME_READY_STATUSES = new Set(["running", "ready", "online", "active", "started"]);
const RUNTIME_FAILED_STATUSES = new Set(["failed", "error", "errored", "dead", "crashed"]);

/**
 * Poll `GET /v2/agents/:id` once and read the hosted runtime status via the
 * canonical `normalizeAgentDetail` adapter (same field path the patron page
 * uses). Returns a snapshot the wizard maps to its loader stages.
 *
 * Never throws: a transient 404/5xx during the worker's container boot is
 * expected, so a failed fetch yields a null/non-terminal snapshot and the
 * caller keeps polling until its own timeout.
 */
export async function fetchProvisioningStatus(
	agentId: string,
	signal?: AbortSignal,
): Promise<ProvisioningStatusSnapshot> {
	try {
		const init: RequestInit = {};
		if (signal) init.signal = signal;
		const raw = await apiFetch<unknown>(`/v2/agents/${encodeURIComponent(agentId)}`, init);
		const detail = normalizeAgentDetail(raw);
		const cloudStatus = detail.runtime?.cloudStatus ?? null;
		const webUiUrl = detail.runtime?.webUiUrl ?? null;
		const lowered = cloudStatus?.toLowerCase() ?? "";
		// Ready requires BOTH a running status AND a reachable chat URL — the
		// backend's syncTokenRuntimeOverlay holds agentStatus at 'provisioning'
		// until webUiUrl exists, so we mirror that bar before declaring success.
		const ready = RUNTIME_READY_STATUSES.has(lowered) && Boolean(webUiUrl);
		const failed = RUNTIME_FAILED_STATUSES.has(lowered);
		return { cloudStatus, webUiUrl, ready, failed };
	} catch {
		return { cloudStatus: null, webUiUrl: null, ready: false, failed: false };
	}
}
