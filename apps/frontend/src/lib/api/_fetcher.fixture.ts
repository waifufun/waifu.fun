import { setApiTokenGetter } from "@/lib/api-auth";
import { type ApiError, apiFetch, isApiError } from "./_fetcher";

/**
 * Framework-agnostic fixtures for `apiFetch`.
 *
 * The frontend package does not currently ship a test runner. These fixtures
 * are written so they can be imported from any runner (vitest, jest, node:test)
 * once one lands, or driven manually via `tsx` for ad-hoc verification.
 *
 * Each scenario returns `{ ok: true } | { ok: false, reason }` so a runner can
 * drive them without depending on a particular assertion library.
 */
export type FixtureResult = { ok: true } | { ok: false; reason: string };

type FetchCall = { url: string; init: RequestInit };

function installFetchMock(handler: (call: FetchCall) => Response | Promise<Response>): {
	calls: FetchCall[];
	restore: () => void;
} {
	const calls: FetchCall[] = [];
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
		const url = typeof input === "string" ? input : input.toString();
		const call: FetchCall = { url, init };
		calls.push(call);
		return handler(call);
	}) as typeof globalThis.fetch;
	return {
		calls,
		restore() {
			globalThis.fetch = original;
		},
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** Adds Authorization when JWT is present. */
export async function fixtureAddsAuthorization(): Promise<FixtureResult> {
	setApiTokenGetter(() => "test-jwt-123");
	const mock = installFetchMock(() => jsonResponse({ ok: true }));
	try {
		await apiFetch("/v2/launches/abc");
		const headers = new Headers(mock.calls[0]?.init.headers);
		const auth = headers.get("Authorization");
		if (auth !== "Bearer test-jwt-123") {
			return { ok: false, reason: `expected Bearer test-jwt-123, got ${auth ?? "null"}` };
		}
		return { ok: true };
	} finally {
		mock.restore();
		setApiTokenGetter(null);
	}
}

/** Skips Authorization when JWT is absent. */
export async function fixtureSkipsAuthorizationWhenNoJwt(): Promise<FixtureResult> {
	setApiTokenGetter(null);
	const mock = installFetchMock(() => jsonResponse({ ok: true }));
	try {
		await apiFetch("/v2/launches/abc");
		const headers = new Headers(mock.calls[0]?.init.headers);
		if (headers.has("Authorization")) {
			return { ok: false, reason: `expected no Authorization, got ${headers.get("Authorization")}` };
		}
		return { ok: true };
	} finally {
		mock.restore();
	}
}

/** Throws ApiError on non-2xx with typed shape. */
export async function fixtureThrowsApiErrorOnNon2xx(): Promise<FixtureResult> {
	setApiTokenGetter(null);
	const mock = installFetchMock(
		() =>
			new Response(JSON.stringify({ error: "not found", code: "AGENT_NOT_FOUND" }), {
				status: 404,
				headers: { "content-type": "application/json" },
			}),
	);
	try {
		await apiFetch("/v2/agents/missing");
		return { ok: false, reason: "expected throw, got value" };
	} catch (err) {
		if (!isApiError(err)) return { ok: false, reason: "thrown value is not an ApiError" };
		const e = err as ApiError;
		if (e.status !== 404) return { ok: false, reason: `expected status 404, got ${e.status}` };
		if (e.code !== "AGENT_NOT_FOUND") return { ok: false, reason: `expected code AGENT_NOT_FOUND, got ${e.code}` };
		if (e.message !== "not found") return { ok: false, reason: `expected message "not found", got "${e.message}"` };
		return { ok: true };
	} finally {
		mock.restore();
	}
}

/** Returns undefined on 204. */
export async function fixtureReturnsUndefinedOn204(): Promise<FixtureResult> {
	setApiTokenGetter(null);
	const mock = installFetchMock(() => new Response(null, { status: 204 }));
	try {
		const result = await apiFetch("/v2/agents/abc/x/disconnect", { method: "POST" });
		if (result !== undefined) return { ok: false, reason: `expected undefined, got ${String(result)}` };
		return { ok: true };
	} finally {
		mock.restore();
	}
}

/** Doesn't override Authorization if explicitly set in init.headers. */
export async function fixturePreservesExplicitAuthorization(): Promise<FixtureResult> {
	setApiTokenGetter(() => "module-jwt");
	const mock = installFetchMock(() => jsonResponse({ ok: true }));
	try {
		await apiFetch("/v2/admin/agents", {
			headers: { Authorization: "Bearer admin-token" },
		});
		const headers = new Headers(mock.calls[0]?.init.headers);
		const auth = headers.get("Authorization");
		if (auth !== "Bearer admin-token") {
			return { ok: false, reason: `expected explicit token preserved, got ${auth ?? "null"}` };
		}
		return { ok: true };
	} finally {
		mock.restore();
		setApiTokenGetter(null);
	}
}

/** Sets Content-Type: application/json automatically when sending a JSON body. */
export async function fixtureSetsJsonContentTypeForBody(): Promise<FixtureResult> {
	setApiTokenGetter(null);
	const mock = installFetchMock(() => jsonResponse({ ok: true }));
	try {
		await apiFetch("/v2/launches/abc/authorize", {
			method: "POST",
			body: JSON.stringify({ firstBuyWei: "0" }),
		});
		const headers = new Headers(mock.calls[0]?.init.headers);
		const ct = headers.get("Content-Type");
		if (ct !== "application/json") {
			return { ok: false, reason: `expected application/json, got ${ct ?? "null"}` };
		}
		return { ok: true };
	} finally {
		mock.restore();
	}
}

export const fixtures = [
	["adds Authorization when JWT is present", fixtureAddsAuthorization],
	["skips Authorization when JWT is absent", fixtureSkipsAuthorizationWhenNoJwt],
	["throws ApiError on non-2xx", fixtureThrowsApiErrorOnNon2xx],
	["returns undefined on 204", fixtureReturnsUndefinedOn204],
	["preserves explicit Authorization in init.headers", fixturePreservesExplicitAuthorization],
	["sets Content-Type: application/json for JSON body", fixtureSetsJsonContentTypeForBody],
] as const satisfies ReadonlyArray<readonly [string, () => Promise<FixtureResult>]>;
