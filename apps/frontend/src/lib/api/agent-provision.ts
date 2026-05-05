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
			safeAddress?: string;
			pullApiKey?: string | null;
			agentApiKey?: string | null;
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
	runtime: {
		kind: "hosted" | "webhook" | "pull";
		webhookUrl: string;
		webhookSecret: string;
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
		runtime:
			state.runtime.kind === "webhook"
				? {
						kind: "webhook",
						webhookUrl: state.runtime.webhookUrl.trim(),
						webhookSecret: state.runtime.webhookSecret,
					}
				: { kind: state.runtime.kind },
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

	const safeAddress = typeof obj.safeAddress === "string" ? obj.safeAddress : undefined;
	const pullApiKey = typeof obj.pullApiKey === "string" ? obj.pullApiKey : obj.pullApiKey === null ? null : undefined;
	const agentApiKey =
		typeof obj.agentApiKey === "string" ? obj.agentApiKey : obj.agentApiKey === null ? null : undefined;

	const result: ProvisionResult = {
		ok: true,
		agentId,
		...(safeAddress !== undefined ? { safeAddress } : {}),
		...(pullApiKey !== undefined ? { pullApiKey } : {}),
		...(agentApiKey !== undefined ? { agentApiKey } : {}),
	};
	return result;
}
