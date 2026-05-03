/**
 * auth-api.ts
 * Client-side helpers for patron Twitter/X auth.
 * All requests use credentials: "include" so the session cookie travels with them.
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export interface PatronUser {
	xUserId: string;
	xHandle: string;
	xDisplayName: string | null;
	xAvatarUrl: string | null;
}

/** Fetch the currently logged-in patron user, or null if not authenticated. */
export async function fetchMe(): Promise<PatronUser | null> {
	try {
		const res = await fetch(`${API_URL}/auth/twitter/me`, {
			credentials: "include",
			cache: "no-store",
		});
		if (!res.ok) return null;
		const json = (await res.json()) as { ok: boolean; data?: { user: PatronUser | null } };
		return json.data?.user ?? null;
	} catch {
		return null;
	}
}

/** Log out the current patron session. */
export async function logout(): Promise<void> {
	try {
		await fetch(`${API_URL}/auth/twitter/logout`, {
			method: "POST",
			credentials: "include",
		});
	} catch {
		// Best-effort: clear local state regardless
	}
}

/**
 * Redirect to the X OAuth login flow.
 *
 * Preserves the current path so the callback can bounce the user back
 * where they started (e.g. /claim/abc). Only same-origin paths are
 * passed through: the backend ignores anything that doesn't start with "/".
 */
export function redirectToXLogin(): void {
	let returnTo = "/";
	try {
		if (typeof window !== "undefined" && window.location) {
			returnTo = window.location.pathname + window.location.search + window.location.hash;
		}
	} catch {
		/* ignore */
	}
	const url = `/auth/twitter/login?return_to=${encodeURIComponent(returnTo)}`;
	window.location.href = url;
}
