import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

export type CreateLaunchTierId = 80 | 90 | 95 | 98;

export type CreateLaunchRequest = {
	inviteCode: string;
	persona: {
		name: string;
		ticker: string;
		bio: string;
		personaPrompt?: string | null;
		avatarTemplateId?: string | null;
		hasAvatarUpload?: boolean;
	};
	tier: CreateLaunchTierId;
	runtime?: {
		kind: "hosted" | "webhook" | "pull";
		webhookUrl?: string;
		webhookSecret?: string;
	};
	safe?: {
		taxAgentBps: number;
		taxPatronBps: number;
		owners: string[];
		threshold: number;
		firstBuyFundingSource: string | null;
		adapters: Array<{ slug: "pancake" | "venus"; enabled: boolean }>;
	};
	/**
	 * Wave M tax routing + Safe config.
	 *
	 * These map 1:1 to the `POST /v2/launches` body fields and end up in
	 * the on-chain TaxSplitter + AgentSafe deployments.
	 */
	patronPlatform?: {
		platformReceiver: string;
		patron?: string | null;
		platformBps: number;
		patronBps: number;
		agentSafeOwners: string[];
		agentSafeThreshold: number;
	};
	launchAuthorization: {
		creator: string;
		siwe: { message: string; signature: string };
	};
};

type ApiEnvelope<T> = { ok?: boolean; data?: T } & T;

function unwrapApiData<T extends Record<string, unknown>>(value: unknown): T | null {
	if (typeof value !== "object" || value === null) return null;
	const maybeEnvelope = value as ApiEnvelope<T>;
	if (typeof maybeEnvelope.data === "object" && maybeEnvelope.data !== null) return maybeEnvelope.data;
	return maybeEnvelope as T;
}

export async function requestLaunchNonce(address: string): Promise<string> {
	const raw = await apiFetch<unknown>("/v2/launches/nonce", {
		method: "POST",
		body: JSON.stringify({ address }),
	});
	const data = unwrapApiData<{ nonce?: string }>(raw);
	if (!data?.nonce) throw new Error("could not create launch nonce");
	return data.nonce;
}

export type CreateLaunchResult =
	| {
			ok: true;
			id: string;
			agentId?: string | null;
			status?: LaunchStatus;
			/**
			 * Deployed token address. The v2 route returns this as `token`; we
			 * also accept the legacy `tokenAddress` key for forward compat.
			 */
			tokenAddress?: string | null;
	  }
	| {
			ok: false;
			reason: "not_wired" | "validation" | "server" | "network";
			message: string;
	  };

/**
 * W48: kick off a launch via `POST /v2/launches`.
 *
 * Returns a typed result so the wizard can handle the not-yet-deployed
 * backend (404 → `not_wired`) and surface a friendly stub flow without
 * tripping toasts. Non-2xx responses are translated the same way the
 * provision client treats them, so behavior stays consistent.
 */
export async function createLaunch(payload: CreateLaunchRequest, signal?: AbortSignal): Promise<CreateLaunchResult> {
	try {
		const body: Record<string, unknown> = {
			name: payload.persona.name,
			symbol: payload.persona.ticker,
			metadataURI: `waifu://create/${encodeURIComponent(payload.inviteCode || payload.persona.ticker || payload.persona.name)}`,
			creator: payload.launchAuthorization.creator,
			tier: String(payload.tier),
			siwe: payload.launchAuthorization.siwe,
		};
		if (payload.patronPlatform) {
			const pp = payload.patronPlatform;
			body.platformReceiver = pp.platformReceiver;
			body.platformBps = pp.platformBps;
			body.patronBps = pp.patronBps;
			if (pp.patron) body.patron = pp.patron;
			if (pp.agentSafeOwners.length > 0) body.agentSafeOwners = pp.agentSafeOwners;
			body.agentSafeThreshold = pp.agentSafeThreshold;
		}
		const init: RequestInit = {
			method: "POST",
			body: JSON.stringify(body),
		};
		if (signal) init.signal = signal;
		const raw = await apiFetch<unknown>("/v2/launches", init);
		const data = unwrapApiData<Record<string, unknown>>(raw);
		if (typeof data !== "object" || data === null) {
			return { ok: false, reason: "server", message: "unexpected payload" };
		}
		const obj = data;
		const id = typeof obj.id === "string" ? obj.id : typeof obj.launchId === "string" ? obj.launchId : null;
		if (!id) return { ok: false, reason: "server", message: "no launch id in response" };
		// v2 route returns the deployed token address as `token`. Older code
		// expected `tokenAddress`; we accept either for resilience while the
		// API redeploy lands.
		const tokenAddress =
			typeof obj.token === "string" ? obj.token : typeof obj.tokenAddress === "string" ? obj.tokenAddress : null;
		const base = {
			ok: true as const,
			id,
			agentId: typeof obj.agentId === "string" ? obj.agentId : null,
			tokenAddress,
		};
		return typeof obj.status === "string" ? { ...base, status: obj.status as LaunchStatus } : base;
	} catch (err) {
		if (isApiError(err)) {
			const apiErr = err as ApiError;
			if (apiErr.status === 404) {
				return { ok: false, reason: "not_wired", message: "launch endpoint not deployed yet" };
			}
			if (apiErr.status === 400 || apiErr.status === 422) {
				return {
					ok: false,
					reason: "validation",
					message: apiErr.message || `validation failed (${apiErr.status})`,
				};
			}
			return {
				ok: false,
				reason: "server",
				message: apiErr.message || `server error (${apiErr.status})`,
			};
		}
		const message = err instanceof Error ? err.message : "network error";
		return { ok: false, reason: "network", message };
	}
}

/**
 * Launch state machine (W6.x backend):
 *   provisioned -> queued -> launching -> live | failed
 *
 * Endpoints:
 *   GET  /v2/launches/:id              -> LaunchState
 *   POST /v2/launches/:id/authorize    -> 202 { status: "queued" } (SIWE-gated)
 */
export type LaunchStatus = "provisioned" | "queued" | "launching" | "live" | "failed";

export type LaunchState = {
	id: string;
	agentId: string;
	status: LaunchStatus;
	firstBuyWei?: string | null;
	tokenAddress?: string | null;
	txHash?: string | null;
	error?: string | null;
	authorizedAt?: string | null;
	launchedAt?: string | null;
};

export function launchQueryKey(launchId: string | undefined) {
	return ["launch", launchId ?? null] as const;
}

export function useLaunchState(launchId: string | undefined, opts: { pollMs?: number; enabled?: boolean } = {}) {
	const enabled = (opts.enabled ?? true) && Boolean(launchId);
	return useQuery<LaunchState>({
		queryKey: launchQueryKey(launchId),
		enabled,
		queryFn: async () => {
			if (!launchId) throw new Error("missing launchId");
			return apiFetch<LaunchState>(`/v2/launches/${encodeURIComponent(launchId)}`);
		},
		refetchInterval: opts.pollMs ?? false,
		retry: 1,
	});
}

export function useAuthorizeLaunch(launchId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation<LaunchState, Error & { status?: number | null }, { firstBuyWei: string }>({
		mutationFn: async ({ firstBuyWei }) => {
			if (!launchId) throw new Error("missing launchId");
			try {
				return await apiFetch<LaunchState>(`/v2/launches/${encodeURIComponent(launchId)}/authorize`, {
					method: "POST",
					body: JSON.stringify({ firstBuyWei }),
				});
			} catch (raw) {
				if (isApiError(raw)) {
					const apiErr = raw as ApiError;
					const err = new Error(apiErr.message) as Error & { status?: number | null };
					err.status = apiErr.status;
					throw err;
				}
				throw raw;
			}
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: launchQueryKey(launchId) });
		},
	});
}
