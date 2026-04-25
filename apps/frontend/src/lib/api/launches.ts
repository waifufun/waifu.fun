import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

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
