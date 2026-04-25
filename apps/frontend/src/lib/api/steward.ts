import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Steward integration. Steward is the patron-agent identity link
 * (https://eliza.steward.dev). One Steward account → many agents owned by
 * the same wallet.
 *
 * Backend contract (W7.4 backend wave):
 *   GET    /v2/patron/steward/status   -> { connected, stewardUserId?, email? }
 *   POST   /v2/patron/steward/link     -> { ok: true }                     body: { stewardToken, stewardUserId }
 *   DELETE /v2/patron/steward/link     -> 204
 *
 * Until the backend lands, GET 404 is treated as "not connected" (silent),
 * and POST 404 falls back to localStorage so the UI keeps working.
 */

export type StewardStatus = {
	connected: boolean;
	stewardUserId?: string | null;
	email?: string | null;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const STEWARD_OAUTH_URL = "https://eliza.steward.dev/oauth/authorize";
export const STEWARD_CLIENT_ID = "waifu-fun";
export const STEWARD_LOCAL_TOKEN_KEY = "waifu-steward-token";
export const STEWARD_LOCAL_USER_KEY = "waifu-steward-user-id";

export function buildStewardAuthUrl(opts: { mode?: "signin" | "signup"; redirectUri: string }) {
	const params = new URLSearchParams({
		client_id: STEWARD_CLIENT_ID,
		redirect_uri: opts.redirectUri,
		response_type: "code",
	});
	if (opts.mode === "signup") {
		params.set("screen", "signup");
	}
	return `${STEWARD_OAUTH_URL}?${params.toString()}`;
}

export function defaultStewardRedirectUri() {
	if (typeof window === "undefined") return "";
	return `${window.location.origin}/auth/steward/callback`;
}

async function getJsonOr404<T>(path: string): Promise<T | null> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method: "GET",
		headers: { Accept: "application/json" },
		credentials: "include",
	});
	if (res.status === 404) return null;
	if (!res.ok) {
		throw new Error(`Request failed ${res.status}: ${path}`);
	}
	return (await res.json()) as T;
}

async function sendJson<T>(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: T | null }> {
	const res = await fetch(`${BASE_URL}${path}`, {
		...init,
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
		credentials: "include",
	});
	const text = await res.text();
	let body: T | null = null;
	if (text) {
		try {
			body = JSON.parse(text) as T;
		} catch {
			body = null;
		}
	}
	return { ok: res.ok, status: res.status, body };
}

export function stewardStatusQueryKey() {
	return ["steward", "status"] as const;
}

/**
 * Resolve the local fallback token written by the callback page when the
 * backend `/v2/patron/steward/link` endpoint is not yet available.
 */
function readLocalFallback(): StewardStatus | null {
	if (typeof window === "undefined") return null;
	try {
		const token = window.localStorage.getItem(STEWARD_LOCAL_TOKEN_KEY);
		const userId = window.localStorage.getItem(STEWARD_LOCAL_USER_KEY);
		if (!token) return null;
		return {
			connected: true,
			stewardUserId: userId,
			// We don't know the email when running in fallback mode; surface a
			// monospace placeholder so the chip still has a recognisable shape.
			email: null,
		};
	} catch {
		return null;
	}
}

export function clearLocalFallback() {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(STEWARD_LOCAL_TOKEN_KEY);
		window.localStorage.removeItem(STEWARD_LOCAL_USER_KEY);
	} catch {
		// ignore quota/security errors
	}
}

export function useStewardStatus() {
	const queryClient = useQueryClient();

	const status = useQuery<StewardStatus>({
		queryKey: stewardStatusQueryKey(),
		queryFn: async () => {
			const data = await getJsonOr404<StewardStatus>("/v2/patron/steward/status");
			if (data) return data;
			// Backend not ready: read whatever the callback wrote locally.
			const fallback = readLocalFallback();
			return fallback ?? { connected: false };
		},
		refetchInterval: 60_000,
		retry: 1,
		staleTime: 30_000,
	});

	const link = useMutation<StewardStatus, Error, { stewardToken: string; stewardUserId?: string | null }>({
		mutationFn: async ({ stewardToken, stewardUserId }) => {
			const result = await sendJson<{ stewardUserId?: string; email?: string }>("/v2/patron/steward/link", {
				method: "POST",
				body: JSON.stringify({ stewardToken, stewardUserId }),
			});
			if (result.ok) {
				return {
					connected: true,
					stewardUserId: result.body?.stewardUserId ?? stewardUserId ?? null,
					email: result.body?.email ?? null,
				};
			}
			if (result.status === 404) {
				// Backend stub fallback.
				if (typeof window !== "undefined") {
					try {
						window.localStorage.setItem(STEWARD_LOCAL_TOKEN_KEY, stewardToken);
						if (stewardUserId) {
							window.localStorage.setItem(STEWARD_LOCAL_USER_KEY, stewardUserId);
						}
					} catch {
						// ignore
					}
				}
				return { connected: true, stewardUserId: stewardUserId ?? null, email: null };
			}
			throw new Error(`steward.link failed (${result.status})`);
		},
		onSuccess: (data) => {
			queryClient.setQueryData(stewardStatusQueryKey(), data);
		},
	});

	const unlink = useMutation<void, Error, void>({
		mutationFn: async () => {
			const result = await sendJson<unknown>("/v2/patron/steward/link", { method: "DELETE" });
			// 404 still counts as success in fallback mode — we just clear local.
			if (!result.ok && result.status !== 404) {
				throw new Error(`steward.unlink failed (${result.status})`);
			}
			clearLocalFallback();
		},
		onSuccess: () => {
			queryClient.setQueryData<StewardStatus>(stewardStatusQueryKey(), { connected: false });
		},
	});

	return { status, link, unlink };
}
