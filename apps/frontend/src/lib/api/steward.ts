import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearStashedPkce, generatePkcePair, generateState, readStashedPkce, stashPkce } from "../pkce";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

/**
 * Steward integration. Steward is the patron-agent identity link
 * (https://eliza.steward.fi). One Steward account → many agents owned by
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

// Steward prod base. NOTE: the canonical host is `eliza.steward.fi` — the
// old `eliza.steward.dev` host is DEAD (DNS no longer resolves) and was the
// cause of the OAuth/passkey "failed to fetch" regressions. Keep every
// Steward reference on `.fi`.
export const STEWARD_BASE_URL =
	(typeof process !== "undefined" && process.env.NEXT_PUBLIC_STEWARD_URL?.trim()) || "https://eliza.steward.fi";
export const STEWARD_OAUTH_AUTHORIZE_URL = `${STEWARD_BASE_URL}/oauth/authorize`;
export const STEWARD_OAUTH_TOKEN_URL = `${STEWARD_BASE_URL}/oauth/token`;
export const STEWARD_CLIENT_ID = "waifu-fun";
export const STEWARD_LOCAL_TOKEN_KEY = "waifu-steward-token";
export const STEWARD_LOCAL_USER_KEY = "waifu-steward-user-id";

/**
 * Build a Steward Authorization-Code + PKCE authorize URL.
 *
 * Steward REQUIRES PKCE for `response_type=code` (the implicit token flow is
 * disabled), so we:
 *   1. generate a `code_verifier` + S256 `code_challenge`
 *   2. stash the verifier (and a CSRF `state`) in sessionStorage so the
 *      callback can complete the code→token exchange
 *   3. include `code_challenge` + `code_challenge_method=S256` + `state` on
 *      the authorize URL
 *
 * Async because deriving the S256 challenge uses `crypto.subtle.digest`.
 */
export async function buildStewardAuthUrl(opts: {
	mode?: "signin" | "signup";
	redirectUri: string;
}): Promise<string> {
	const { codeVerifier, codeChallenge, codeChallengeMethod } = await generatePkcePair();
	const state = generateState();
	// Stash BEFORE returning the URL so the verifier is durable even if the
	// caller navigates immediately.
	stashPkce(codeVerifier, state);

	const params = new URLSearchParams({
		client_id: STEWARD_CLIENT_ID,
		redirect_uri: opts.redirectUri,
		response_type: "code",
		code_challenge: codeChallenge,
		code_challenge_method: codeChallengeMethod,
		state,
	});
	if (opts.mode === "signup") {
		params.set("screen", "signup");
	}
	return `${STEWARD_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export interface StewardTokenResult {
	token: string;
	refreshToken?: string | null;
	stewardUserId?: string | null;
}

/**
 * Complete the PKCE code→token exchange against Steward.
 *
 * Reads the stashed `code_verifier` (+ validates `state` for CSRF) written by
 * {@link buildStewardAuthUrl}, then POSTs to Steward's token endpoint. On
 * success the stash is cleared and the issued token(s) are returned for the
 * caller to finalize against the waifu.fun backend.
 *
 * Steward's token endpoint expects: { code, redirectUri, code_verifier }.
 */
export async function exchangeStewardCode(opts: {
	code: string;
	redirectUri: string;
	state?: string | null;
}): Promise<StewardTokenResult> {
	const { verifier, state: stashedState } = readStashedPkce();
	if (!verifier) {
		throw new Error("missing PKCE code_verifier — start the sign-in again");
	}
	// CSRF: if Steward echoed our state back, it must match what we stashed.
	if (opts.state && stashedState && opts.state !== stashedState) {
		throw new Error("OAuth state mismatch — possible CSRF, sign in again");
	}

	const res = await fetch(STEWARD_OAUTH_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			code: opts.code,
			redirectUri: opts.redirectUri,
			redirect_uri: opts.redirectUri,
			code_verifier: verifier,
			client_id: STEWARD_CLIENT_ID,
		}),
	});

	const json = (await res.json().catch(() => null)) as {
		ok?: boolean;
		token?: string;
		accessToken?: string;
		refreshToken?: string;
		userId?: string;
		error?: string;
		message?: string;
	} | null;

	if (!res.ok || !json) {
		throw new Error(json?.message ?? json?.error ?? `steward token exchange failed (http ${res.status})`);
	}

	const token = json.token ?? json.accessToken;
	if (!token) {
		throw new Error("steward token exchange returned no token");
	}

	clearStashedPkce();
	return { token, refreshToken: json.refreshToken ?? null, stewardUserId: json.userId ?? null };
}

export function defaultStewardRedirectUri() {
	if (typeof window === "undefined") return "";
	return `${window.location.origin}/auth/steward/callback`;
}

async function getJsonOr404<T>(path: string): Promise<T | null> {
	try {
		return await apiFetch<T>(path);
	} catch (err) {
		if (isApiError(err) && (err as ApiError).status === 404) return null;
		throw err;
	}
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

	const link = useMutation<StewardStatus, Error, { stewardToken: string; stewardUserId?: string | null | undefined }>({
		mutationFn: async ({ stewardToken, stewardUserId }) => {
			try {
				const body = await apiFetch<{ stewardUserId?: string; email?: string }>("/v2/patron/steward/link", {
					method: "POST",
					body: JSON.stringify({ stewardToken, stewardUserId }),
				});
				return {
					connected: true,
					stewardUserId: body?.stewardUserId ?? stewardUserId ?? null,
					email: body?.email ?? null,
				};
			} catch (err) {
				if (isApiError(err) && (err as ApiError).status === 404) {
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
				if (isApiError(err)) {
					throw new Error(`steward.link failed (${(err as ApiError).status})`);
				}
				throw err;
			}
		},
		onSuccess: (data) => {
			queryClient.setQueryData(stewardStatusQueryKey(), data);
		},
	});

	const unlink = useMutation<void, Error, void>({
		mutationFn: async () => {
			try {
				await apiFetch<unknown>("/v2/patron/steward/link", { method: "DELETE" });
			} catch (err) {
				// 404 still counts as success in fallback mode: we just clear local.
				if (!(isApiError(err) && (err as ApiError).status === 404)) {
					if (isApiError(err)) {
						throw new Error(`steward.unlink failed (${(err as ApiError).status})`);
					}
					throw err;
				}
			}
			clearLocalFallback();
		},
		onSuccess: () => {
			queryClient.setQueryData<StewardStatus>(stewardStatusQueryKey(), { connected: false });
		},
	});

	return { status, link, unlink };
}
