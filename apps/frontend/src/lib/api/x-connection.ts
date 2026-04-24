import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

async function postJson<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		credentials: "include",
	});
	if (!res.ok) {
		let message = `Request failed ${res.status}`;
		try {
			const body = (await res.json()) as { message?: string; error?: string };
			if (body?.message) message = body.message;
			else if (body?.error) message = body.error;
		} catch {
			// non-JSON body, ignore
		}
		throw new Error(message);
	}
	// 204 or empty body is fine
	const text = await res.text();
	if (!text) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {} as T;
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
			return getJson<XConnectionStatus>(`/v2/agents/${encodeURIComponent(agentId)}/x/status`);
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
