import { getStewardJwt } from "@/lib/api-auth";
import { SAME_ORIGIN_API } from "@/lib/same-origin-api";

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

/**
 * Safe accessor for an error's human message, for rendering in JSX.
 *
 * Defense-in-depth against React #31: even if some error somehow carries a
 * non-string `.message` (e.g. a raw `{code, message}` API envelope), this
 * always returns a STRING so it can never be rendered as a raw object child.
 */
export function errorText(err: unknown, fallback = "something went wrong"): string {
	if (err == null) return fallback;
	if (typeof err === "string") return err || fallback;
	if (err instanceof Error) return err.message || fallback;
	if (typeof err === "object") {
		const msg = (err as { message?: unknown }).message;
		if (typeof msg === "string" && msg.length > 0) return msg;
		// message is itself an object (e.g. a {code, message} envelope) or absent.
		if (msg && typeof msg === "object") {
			const inner = (msg as { message?: unknown }).message;
			if (typeof inner === "string" && inner.length > 0) return inner;
		}
		return fallback;
	}
	return fallback;
}

export function isApiError(value: unknown): value is ApiError {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { status?: unknown }).status === "number" &&
		typeof (value as { message?: unknown }).message === "string"
	);
}

// Same-origin path: mobile in-app browser WebViews (zerion, MM mobile, Trust)
// block cookies on cross-origin XHR even within the same registrable domain.
// /v2/* and /v3/* paths are intercepted by the CF Pages function in
// functions/[[path]].js and proxied server-to-server to api.waifu.fun. See
// src/lib/same-origin-api.ts.
const BASE_URL = SAME_ORIGIN_API;

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
 * Resolve a parsed error body into a STRING message (+ optional code),
 * tolerating both error envelope shapes the waifu-core API emits:
 *
 *   1. Canonical (apps/api middleware/error-handler.ts toErrorPayload):
 *      `{ ok:false, error: { code, message, details }, requestId }`
 *      Here `error` is an OBJECT. When `details` is undefined it serializes to
 *      exactly `{ code, message }` — which, if rendered raw in JSX, triggers
 *      React error #31 ("objects are not valid as a React child"). We MUST pull
 *      the string `message` out of it so `ApiError.message` is never an object.
 *
 *   2. Legacy flat: `{ error: "SOME_CODE", message?: string, code?: string }`
 *      Here `error` is a STRING (an error code/label).
 *
 * Always returns a string `message`; never leaks an object into `.message`.
 */
export function extractApiError(
	parsed: Record<string, unknown> | null,
	statusText: string,
	status: number,
): { message: string; code?: string } {
	const fallback = statusText || `HTTP ${status}`;
	if (!parsed) return { message: fallback };

	const withCode = (message: string, code: string | undefined): { message: string; code?: string } =>
		code ? { message, code } : { message };

	const rawError = parsed.error;
	const topMessage = typeof parsed.message === "string" ? parsed.message : undefined;
	const topCode = typeof parsed.code === "string" ? parsed.code : undefined;

	// Canonical nested envelope: error is an object { code, message, details }.
	if (rawError && typeof rawError === "object") {
		const nested = rawError as Record<string, unknown>;
		const nestedMessage = typeof nested.message === "string" ? nested.message : undefined;
		const nestedCode = typeof nested.code === "string" ? nested.code : undefined;
		return withCode(nestedMessage ?? topMessage ?? fallback, nestedCode ?? topCode);
	}

	// Legacy flat envelope: error is a string code/label.
	if (typeof rawError === "string") {
		return withCode(topMessage ?? rawError ?? fallback, topCode ?? rawError);
	}

	// No `error` field: fall back to a top-level message/code if present.
	return withCode(topMessage ?? fallback, topCode);
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
		let parsed: Record<string, unknown> | null = null;
		if (text) {
			try {
				parsed = JSON.parse(text) as Record<string, unknown>;
			} catch {
				// Non-JSON error body (e.g. HTML 404 from a CDN). Keep going,
				// just don't pretend it's a structured error.
				parsed = null;
			}
		}
		const { message, code } = extractApiError(parsed, res.statusText, res.status);
		const err: ApiError = {
			status: res.status,
			message,
			...(code ? { code } : {}),
			...(parsed ? { details: parsed } : text ? { details: text.slice(0, 500) } : {}),
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
