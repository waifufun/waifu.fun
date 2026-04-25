import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function getJson<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method: "GET",
		headers: { Accept: "application/json" },
		credentials: "include",
	});
	if (!res.ok) {
		throw new Error(`Request failed ${res.status}: ${path}`);
	}
	return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		let message = `Request failed ${res.status}`;
		const code: number | null = res.status;
		try {
			const bodyJson = (await res.json()) as { message?: string; error?: string };
			if (bodyJson?.message) message = bodyJson.message;
			else if (bodyJson?.error) message = bodyJson.error;
		} catch {
			// non-JSON body
		}
		const err = new Error(message) as Error & { status?: number | null };
		err.status = code;
		throw err;
	}
	const text = await res.text();
	if (!text) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {} as T;
	}
}

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
			return getJson<LaunchState>(`/v2/launches/${encodeURIComponent(launchId)}`);
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
			return postJson<LaunchState>(`/v2/launches/${encodeURIComponent(launchId)}/authorize`, { firstBuyWei });
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: launchQueryKey(launchId) });
		},
	});
}
