import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

/**
 * Per-agent X (Twitter) OAuth connection state.
 *
 * Backend contract (apps/api/src/routes/v2/agents-x.ts, Wave 9 auth):
 *   GET    /v2/agents/:agentId/x/status        -> { connected, xHandle, connectedAt }
 *   POST   /v2/agents/:agentId/x/oauth/start   -> { authorizeUrl }
 *   DELETE /v2/agents/:agentId/x/disconnect    -> { ok: true }
 *
 * These paths/verbs MUST match the API exactly. They previously pointed at
 * `/x/status` (ok), `POST /x/connect` (did not exist), and
 * `POST /x/disconnect` (wrong verb — the route is DELETE), which 404'd and
 * surfaced a scary red "Route not found" in the panel.
 */
export type XConnectionStatus = {
	connected: boolean;
	xHandle?: string | null;
	connectedAt?: string | null;
};

async function requestJson<T>(path: string, method: "POST" | "DELETE"): Promise<T> {
	try {
		const result = await apiFetch<T>(path, { method });
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
			try {
				return await apiFetch<XConnectionStatus>(`/v2/agents/${encodeURIComponent(agentId)}/x/status`);
			} catch (err) {
				// Degrade gracefully: a missing route (404) or an environment
				// where X OAuth is not configured (501 TWITTER_AUTH_NOT_CONFIGURED)
				// is not an error worth a scary red panel — it just means "not
				// connected". Anything else (401/403/5xx) is a real failure and
				// should surface so the owner knows auth/ownership is broken.
				if (isApiError(err) && (err.status === 404 || err.status === 501)) {
					return { connected: false, xHandle: null, connectedAt: null } satisfies XConnectionStatus;
				}
				throw err;
			}
		},
		refetchInterval: 60_000,
		retry: 1,
	});

	const connect = useMutation<{ authorizationUrl: string }, Error, void>({
		mutationFn: async () => {
			if (!agentId) throw new Error("missing agentId");
			// API route is `POST /x/oauth/start` and returns `{ authorizeUrl }`.
			// Normalize to `authorizationUrl` so the panel's existing field name
			// keeps working regardless of the backend key.
			const res = await requestJson<{ authorizeUrl?: string; authorizationUrl?: string }>(
				`/v2/agents/${encodeURIComponent(agentId)}/x/oauth/start`,
				"POST",
			);
			return { authorizationUrl: res.authorizeUrl ?? res.authorizationUrl ?? "" };
		},
	});

	const disconnect = useMutation<unknown, Error, void>({
		mutationFn: async () => {
			if (!agentId) throw new Error("missing agentId");
			// API route is `DELETE /x/disconnect` (NOT POST).
			return requestJson<unknown>(`/v2/agents/${encodeURIComponent(agentId)}/x/disconnect`, "DELETE");
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
