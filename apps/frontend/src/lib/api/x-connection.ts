import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

/**
 * Per-agent X (Twitter) OAuth connection state.
 *
 * Backend contract (W1.6):
 *   GET  /v2/agents/:agentId/x/status      -> { connected, xHandle?, connectedAt? }
 *   POST /v2/agents/:agentId/x/connect     -> { authorizationUrl }
 *   POST /v2/agents/:agentId/x/disconnect  -> 200 (idempotent)
 */
export type XConnectionStatus = {
	connected: boolean;
	xHandle?: string | null;
	connectedAt?: string | null;
};

async function postJson<T>(path: string): Promise<T> {
	try {
		const result = await apiFetch<T>(path, { method: "POST" });
		return (result ?? ({} as T)) as T;
	} catch (err) {
		if (isApiError(err)) {
			throw new Error((err as ApiError).message);
		}
		throw err;
	}
}

export function xConnectionQueryKey(agentId: string | undefined) {
	return ["x-connection", agentId ?? null] as const;
}

export function useXConnection(agentId?: string) {
	const queryClient = useQueryClient();

	const status = useQuery<XConnectionStatus>({
		queryKey: xConnectionQueryKey(agentId),
		enabled: Boolean(agentId),
		queryFn: async () => {
			if (!agentId) throw new Error("missing agentId");
			return apiFetch<XConnectionStatus>(`/v2/agents/${encodeURIComponent(agentId)}/x/status`);
		},
		refetchInterval: 60_000,
		retry: 1,
	});

	const connect = useMutation<{ authorizationUrl: string }, Error, void>({
		mutationFn: async () => {
			if (!agentId) throw new Error("missing agentId");
			return postJson<{ authorizationUrl: string }>(`/v2/agents/${encodeURIComponent(agentId)}/x/connect`);
		},
	});

	const disconnect = useMutation<unknown, Error, void>({
		mutationFn: async () => {
			if (!agentId) throw new Error("missing agentId");
			return postJson<unknown>(`/v2/agents/${encodeURIComponent(agentId)}/x/disconnect`);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: xConnectionQueryKey(agentId) });
		},
	});

	return { status, connect, disconnect };
}

export function formatRelativeTime(iso: string | null | undefined): string {
	if (!iso) return "";
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return "";
	const diffMs = Date.now() - t;
	const sec = Math.max(0, Math.floor(diffMs / 1000));
	if (sec < 60) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	if (day < 30) return `${day}d ago`;
	const month = Math.floor(day / 30);
	if (month < 12) return `${month}mo ago`;
	const year = Math.floor(month / 12);
	return `${year}y ago`;
}
