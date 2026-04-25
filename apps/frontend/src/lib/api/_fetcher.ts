import { getStewardJwt } from "@/lib/api-auth";

/**
 * Canonical fetch wrapper for the waifu-core API.
 *
 * - Adds `Authorization: Bearer <Steward JWT>` when the user is signed in
 *   via `@stwd/react` (`useApiAuth` syncs the token into a module-global
 *   that `getStewardJwt()` reads).
 * - Adds `credentials: "include"` so legacy cookie-based auth continues
 *   to work alongside the JWT during the W9 transition.
 * - Throws a typed `ApiError` on non-2xx so consumers can do
 *   `if ((err as ApiError).status === 404) { ... }` without sniffing
 *   `Error.message` strings.
 *
 * Plain function on purpose: callable from non-hook contexts (background
 * sync, server-rendered helpers, mutation `mutationFn` closures).
 */
export type ApiError = {
	status: number;
	code?: string | undefined;
	message: string;
	details?: unknown;
};

export function isApiError(value: unknown): value is ApiError {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { status?: unknown }).status === "number" &&
		typeof (value as { message?: unknown }).message === "string"
	);
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Resolve a request URL against `NEXT_PUBLIC_API_URL`.
 *
 * - Absolute URLs (`http(s)://`) pass through.
 * - Relative paths are prefixed with `BASE_URL`.
 */
function resolveUrl(url: string): string {
	if (/^https?:\/\//i.test(url)) return url;
	if (!BASE_URL) return url;
	if (url.startsWith("/")) return `${BASE_URL}${url}`;
	return `${BASE_URL}/${url}`;
}

function shouldSetJsonContentType(init: RequestInit, headers: Headers): boolean {
	if (headers.has("Content-Type")) return false;
	if (!init.body) return false;
	if (typeof FormData !== "undefined" && init.body instanceof FormData) return false;
	if (typeof Blob !== "undefined" && init.body instanceof Blob) return false;
	if (typeof URLSearchParams !== "undefined" && init.body instanceof URLSearchParams) return false;
	if (typeof ArrayBuffer !== "undefined" && init.body instanceof ArrayBuffer) return false;
	return true;
}

/**
 * Canonical fetch wrapper for `lib/api/*.ts` modules.
 *
 * @example
 * const launch = await apiFetch<LaunchState>(`/v2/launches/${id}`);
 * await apiFetch(`/v2/launches/${id}/authorize`, {
 *   method: "POST",
 *   body: JSON.stringify({ firstBuyWei }),
 * });
 */
export async function apiFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);

	const jwt = getStewardJwt();
	if (jwt && !headers.has("Authorization")) {
		headers.set("Authorization", `Bearer ${jwt}`);
	}
	if (!headers.has("Accept")) {
		headers.set("Accept", "application/json");
	}
	if (shouldSetJsonContentType(init, headers)) {
		headers.set("Content-Type", "application/json");
	}

	const res = await fetch(resolveUrl(url), {
		...init,
		headers,
		credentials: init.credentials ?? "include",
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		let parsed: { code?: string; error?: string; message?: string } | null = null;
		if (text) {
			try {
				parsed = JSON.parse(text) as typeof parsed;
			} catch {
				parsed = null;
			}
		}
		const err: ApiError = {
			status: res.status,
			message: parsed?.error || parsed?.message || res.statusText || `HTTP ${res.status}`,
			...(parsed?.code ? { code: parsed.code } : {}),
			...(parsed ? { details: parsed } : text ? { details: text } : {}),
		};
		throw err;
	}

	if (res.status === 204) return undefined as T;

	const contentType = res.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		const text = await res.text();
		if (!text) return undefined as T;
		try {
			return JSON.parse(text) as T;
		} catch {
			return text as unknown as T;
		}
	}

	return (await res.json()) as T;
}
