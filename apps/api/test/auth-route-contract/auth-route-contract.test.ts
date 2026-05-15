/**
 * Frontend ↔ backend auth route contract test.
 *
 * Asserts every auth endpoint the frontend calls actually exists on the api.
 * Class of bugs this prevents:
 *
 *   - PR #557: connect-modal.tsx called `/v2/auth/oauth/{provider}/start` and
 *     `/v2/auth/email/start`, neither of which exist (backend mounts under
 *     `/auth/oauth/start?provider=...` and `/auth/email/start`). Both returned
 *     404, breaking the entire OAuth + email magic-link flow on dev.waifu.fun.
 *
 * The contract is intentionally about ROUTE MOUNTING, not behavior. We assert
 * each path returns SOMETHING OTHER THAN the global 404 ({"code":"NOT_FOUND"})
 * when hit with the method the frontend uses. Auth-required routes returning
 * 401 prove they're mounted; we don't try to authenticate them.
 *
 * Adding a new frontend → api auth call?  Add it to AUTH_ROUTES below.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Hono } from "hono";

// We don't boot the full app with deps (that needs DB + Flap RPC). Instead we
// build a minimal Hono with the SAME route mounts that app.ts uses, then ping
// each route. If app.ts changes its mounts, this test must be updated in
// lockstep, and the lockstep is enforced by importing the route factories
// directly from src/.
import { createEmailAuthRoutes } from "../../src/routes/email-auth.ts";
import { createOAuthRoutes } from "../../src/routes/oauth.ts";
import { createPasskeyAuthRoutes } from "../../src/routes/passkey-auth.ts";
import { authSiweRoutes } from "../../src/routes/v2/auth-siwe.ts";

type Method = "GET" | "POST" | "DELETE";

interface Route {
	/** Method the frontend uses to call this. */
	method: Method;
	/** Path on api.waifu.fun (no host). */
	path: string;
	/** Human-readable description for failure messages. */
	caller: string;
	/**
	 * Optional: status code(s) we tolerate. Default: anything other than 404.
	 * For routes that return 404 legitimately (e.g. "passkey not found"), we
	 * still want to assert that the ROUTE matched, so we look at response body
	 * for the global notFoundHandler signature instead of just the status.
	 */
	tolerateStatus?: number[];
}

/**
 * The full set of auth endpoints the frontend depends on.  Drift here breaks
 * sign-in for real users.
 */
const AUTH_ROUTES: Route[] = [
	// --- OAuth (header connect modal + standalone /auth/connect page) ---
	{
		method: "GET",
		path: "/auth/oauth/start?provider=github&return_to=/patron",
		caller: "connect-modal.tsx handleProvider() / oauth-connect-panel.tsx",
	},
	{
		method: "GET",
		path: "/auth/oauth/start?provider=google&return_to=/patron",
		caller: "connect-modal.tsx handleProvider() / oauth-connect-panel.tsx",
	},
	{
		method: "GET",
		path: "/auth/oauth/start?provider=discord&return_to=/patron",
		caller: "connect-modal.tsx handleProvider() / oauth-connect-panel.tsx",
	},
	{
		method: "GET",
		path: "/auth/oauth/start?provider=twitter&return_to=/patron",
		caller: "connect-modal.tsx handleProvider() / oauth-connect-panel.tsx",
	},
	{
		method: "POST",
		path: "/auth/oauth/finalize",
		caller: "/auth/oauth/callback page.tsx (browser POST)",
	},
	{
		method: "POST",
		path: "/auth/oauth/logout",
		caller: "WaifuUserMenu sign-out",
	},

	// --- Email magic link ---
	{
		method: "POST",
		path: "/auth/email/start",
		caller: "connect-modal.tsx handleEmailSubmit()",
	},

	// --- Passkey ---
	{
		method: "POST",
		path: "/auth/passkey/finalize",
		caller: "lib/passkey.ts loginWithPasskey() / registerPasskey()",
	},

	// --- SIWE wallet binding (mounted under /v2) ---
	{
		method: "POST",
		path: "/v2/auth/siwe/nonce",
		caller: "lib/api/wallets.ts requestSiweNonce()",
	},
	{
		method: "POST",
		path: "/v2/auth/siwe/bind",
		caller: "lib/api/wallets.ts bindSiwe()",
	},
	{
		method: "GET",
		path: "/v2/auth/siwe/wallets",
		caller: "lib/api/wallets.ts listWallets()",
	},
];

let testApp: Hono;

beforeEach(() => {
	// Build the same auth route tree as app.ts (without DB-backed deps that we
	// can't easily fake here). Routes still match, even if their handlers
	// throw downstream. We're testing route MOUNTING, not handler behavior.
	const app = new Hono();
	app.route("/auth/oauth", createOAuthRoutes());
	app.route("/auth/email", createEmailAuthRoutes());
	app.route("/auth/passkey", createPasskeyAuthRoutes());

	const v2 = new Hono();
	v2.route("/auth/siwe", authSiweRoutes);
	app.route("/v2", v2);

	// Match the global notFoundHandler signature so we can detect 404s vs.
	// real responses.
	app.notFound((c) =>
		c.json(
			{
				ok: false,
				error: { code: "NOT_FOUND", message: "Route not found" },
			},
			404,
		),
	);

	testApp = app;
});

afterEach(() => {
	testApp = new Hono();
});

describe("auth route contract: every frontend caller has a backend route", () => {
	for (const route of AUTH_ROUTES) {
		it(`${route.method} ${route.path}  (${route.caller})`, async () => {
			const init: RequestInit = { method: route.method };
			if (route.method === "POST") {
				init.headers = { "Content-Type": "application/json" };
				init.body = JSON.stringify({});
			}

			const res = await testApp.request(`http://test.local${route.path}`, init);

			// If the route is unmounted, Hono falls through to notFound handler
			// returning 404 with `{ error: { code: "NOT_FOUND" } }`. That's the
			// signal we're testing for. Real handlers may also return 404 (e.g.
			// "passkey not found for that email") but with a DIFFERENT body
			// shape, which is fine.
			if (res.status === 404) {
				const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
				const isGlobalNotFound = body?.error?.code === "NOT_FOUND";
				assert.ok(
					!isGlobalNotFound,
					`Route ${route.method} ${route.path} returned the global NOT_FOUND handler. This means the route is NOT MOUNTED on the api, but the frontend (${route.caller}) tries to call it. Either fix the frontend path or mount the route in apps/api/src/app.ts.`,
				);
			}

			// All other status codes (200, 302, 400, 401, 405, 500, etc.) prove
			// the route matched. Anything matching is a pass for this contract.
			assert.ok(
				res.status >= 200 && res.status < 600,
				`Route ${route.method} ${route.path} returned a non-HTTP status (${res.status}). Investigate.`,
			);
		});
	}
});

describe("auth route contract: known-bad paths from PR #557 should still 404", () => {
	// Negative cases: the OLD broken paths from before PR #557. If anyone
	// "fixes" the contract by adding aliases for these instead of fixing the
	// frontend, the alias paths below should be removed too.
	const REGRESSION_PATHS = [
		{ method: "GET" as Method, path: "/v2/auth/oauth/github/start" },
		{ method: "GET" as Method, path: "/v2/auth/oauth/google/start" },
		{ method: "GET" as Method, path: "/v2/auth/oauth/discord/start" },
		{ method: "POST" as Method, path: "/v2/auth/email/start" },
	];

	for (const r of REGRESSION_PATHS) {
		it(`${r.method} ${r.path} should NOT exist (path was a frontend invention)`, async () => {
			const init: RequestInit = { method: r.method };
			if (r.method === "POST") {
				init.headers = { "Content-Type": "application/json" };
				init.body = JSON.stringify({});
			}
			const res = await testApp.request(`http://test.local${r.path}`, init);
			assert.equal(
				res.status,
				404,
				`Path ${r.method} ${r.path} unexpectedly exists. If you added it as an alias to fix a bug, that's the wrong fix — fix the frontend caller instead and remove the alias.`,
			);
		});
	}
});
