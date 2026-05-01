/**
 * Steward OAuth bridge (W9.5).
 *
 * Browser-driven flow:
 *
 *   1. Frontend calls GET /auth/oauth/start?provider=<id>&return_to=<path>
 *      Backend sets a short-lived HttpOnly `wf_oauth_return` cookie carrying
 *      the post-login destination, then 302s the user to Steward's hosted
 *      OAuth start endpoint with `tenant_id=waifu` and the redirect URI
 *      pointing back at the FRONTEND's callback page.
 *
 *   2. Steward runs the provider OAuth (Google/GitHub/Discord/Twitter/Email/
 *      Passkey) and redirects back to https://waifu.fun/auth/oauth/callback
 *      with the issued JWT in the URL.
 *
 *   3. The frontend callback page reads the JWT from the URL and POSTs to
 *      POST /auth/oauth/finalize { token }. This endpoint:
 *        - verifies the Steward JWT (HS256, issuer=steward, tenant=waifu)
 *        - upserts a `patron_users` row keyed by `steward_user_id`
 *        - sets the long-lived `wf_session` cookie carrying the Steward JWT
 *        - clears the temp return cookie
 *        - returns the (sanitized) `return_to` for the frontend to navigate to
 *
 * Why split the callback between FE and BE? Steward issues the JWT via a 302
 * with the token in a URL parameter, so the only place that can pick it up
 * cleanly is the frontend SPA. The backend then re-verifies and binds the
 * cookie under the api.waifu.fun origin.
 *
 * Note: there is no app-level CSRF state token. Steward keeps its own
 * server-side state for the OAuth dance and does not echo a caller-supplied
 * `state` back to us, so the HS256 JWT signature against STEWARD_JWT_SECRET
 * is the real authn at /finalize.
 */

import { patronUsers } from "@waifufun/db";
import { getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import { respondOk } from "../lib/http.js";
import { SESSION_COOKIE_NAME, buildSessionCookieHeader, getCookieOptions } from "../lib/session.js";
import { verifyStewardJwt } from "../middleware/steward-auth.js";

// ─── Provider allowlist ───────────────────────────────────────────

/**
 * Providers we know Steward can front. See AUTH_PLAN.md §0:
 *   Google, GitHub, Discord, Twitter, Passkey, Email (Resend).
 *
 * Steward exposes them under two URL shapes:
 *   - `/api/v1/auth/oauth/<provider>` for the OAuth-2 providers
 *   - `/api/v1/auth/<provider>/start`  for email + passkey flows
 */
const OAUTH_PROVIDERS = ["google", "github", "discord", "twitter"] as const;
const OTHER_PROVIDERS = ["email", "passkey"] as const;
type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
type OtherProvider = (typeof OTHER_PROVIDERS)[number];
type Provider = OAuthProvider | OtherProvider;

function isProvider(value: string | undefined): value is Provider {
	if (!value) return false;
	return (
		(OAUTH_PROVIDERS as readonly string[]).includes(value) || (OTHER_PROVIDERS as readonly string[]).includes(value)
	);
}

// ─── Cookie naming + helpers ──────────────────────────────────────

export const OAUTH_RETURN_COOKIE = "wf_oauth_return";
const OAUTH_TEMP_TTL_SECONDS = 600; // 10 minutes — enough for the round-trip

function buildTempCookie(name: string, value: string, secure: boolean): string {
	const parts = [`${name}=${value}`, `Max-Age=${OAUTH_TEMP_TTL_SECONDS}`, "Path=/", "HttpOnly", "SameSite=Lax"];
	// Domain set so wf_oauth_return survives the Steward round-trip back to
	// the Next.js /api/auth/finalize proxy on a sibling subdomain.
	const domain = process.env.SESSION_COOKIE_DOMAIN;
	if (domain) parts.push(`Domain=${domain}`);
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

function clearTempCookie(name: string, secure: boolean): string {
	const parts = [`${name}=`, "Max-Age=0", "Path=/", "HttpOnly", "SameSite=Lax"];
	const domain = process.env.SESSION_COOKIE_DOMAIN;
	if (domain) parts.push(`Domain=${domain}`);
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

function parseCookies(cookieHeader: string): Record<string, string> {
	const out: Record<string, string> = {};
	if (!cookieHeader) return out;
	for (const part of cookieHeader.split(";")) {
		const idx = part.indexOf("=");
		if (idx < 0) continue;
		const key = part.slice(0, idx).trim();
		const value = part.slice(idx + 1).trim();
		if (key) out[key] = value;
	}
	return out;
}

/**
 * Same-origin only. Reject absolute URLs, protocol-relative paths, backslash
 * tricks, and anything past 200 chars. Result is the path itself; the FE
 * is responsible for prepending its own origin.
 */
function sanitizeReturnTo(raw: string | null | undefined): string | null {
	if (!raw) return null;
	if (raw.length > 200) return null;
	if (!raw.startsWith("/")) return null;
	if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
	return raw;
}

// ─── Test injection hooks ─────────────────────────────────────────

type StewardVerifier = typeof verifyStewardJwt;
type DbHandle = ReturnType<typeof getDatabase>["db"];

let stewardVerifierForTest: StewardVerifier | undefined;
let dbForTest: DbHandle | undefined;

export function __setOAuthStewardVerifierForTest(verifier: StewardVerifier | undefined): void {
	stewardVerifierForTest = verifier;
}

export function __setOAuthDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}

function getDb(): DbHandle {
	return dbForTest ?? getDatabase().db;
}

function getVerifier(): StewardVerifier {
	return stewardVerifierForTest ?? verifyStewardJwt;
}

// ─── URL builder ──────────────────────────────────────────────────

interface BuiltStartUrl {
	url: URL;
	redirectUri: string;
}

function buildStewardStartUrl(provider: Provider): BuiltStartUrl {
	const stewardBase = process.env.STEWARD_API_URL ?? "https://eliza.steward.fi";
	const tenant = process.env.STEWARD_TENANT_ID ?? "waifu";
	const frontendBase = process.env.FRONTEND_URL ?? "https://waifu.fun";
	const redirectUri = `${frontendBase}/auth/oauth/callback`;

	const isOAuth = (OAUTH_PROVIDERS as readonly string[]).includes(provider);
	// Steward routes are mounted at /auth/* (NOT /api/v1/auth/*).
	// OAuth providers: GET /auth/oauth/<provider>/authorize (then 302s to provider)
	// Email magic-link: POST /auth/email/send (a different POST flow, handled separately)
	// Passkey: WebAuthn flow, also separate.
	const path = isOAuth ? `/auth/oauth/${provider}/authorize` : `/auth/${provider}/start`;

	const url = new URL(path, stewardBase);
	// Steward keys on `tenant_id`. `tenant` is kept as a belt-and-suspenders
	// alias for any older Steward path that may still read the legacy name.
	url.searchParams.set("tenant_id", tenant);
	url.searchParams.set("tenant", tenant);
	url.searchParams.set("redirect_uri", redirectUri);
	if (!isOAuth) {
		url.searchParams.set("return_to", redirectUri);
	}
	return { url, redirectUri };
}

// ─── Router ───────────────────────────────────────────────────────

export function createOAuthRoutes() {
	const app = new Hono<AppBindings>();

	/**
	 * GET /auth/oauth/start?provider=<id>&return_to=</path>
	 *
	 * - Validates provider against the allowlist.
	 * - Validates `return_to` is same-origin (path-only).
	 * - Sets `wf_oauth_return` cookie (HttpOnly, Secure, SameSite=Lax, 10m TTL).
	 * - 302 redirects to Steward's start URL.
	 */
	app.get("/start", (c) => {
		const provider = c.req.query("provider");
		if (!isProvider(provider)) {
			return c.json(
				{
					ok: false,
					error: "INVALID_PROVIDER",
					message: `provider must be one of: ${[...OAUTH_PROVIDERS, ...OTHER_PROVIDERS].join(", ")}`,
				},
				400,
			);
		}

		const returnTo = sanitizeReturnTo(c.req.query("return_to")) ?? "/patron";
		const secure = (process.env.SESSION_COOKIE_SECURE ?? "true") === "true";

		const { url } = buildStewardStartUrl(provider);

		// Use c.header(append:true) for Set-Cookie. See /finalize for why
		// raw Response.headers.append doesn't survive Hono on Node 22 in prod.
		c.header("Set-Cookie", buildTempCookie(OAUTH_RETURN_COOKIE, encodeURIComponent(returnTo), secure), {
			append: true,
		});
		return c.redirect(url.toString(), 302);
	});

	/**
	 * POST /auth/oauth/finalize { token, refreshToken? }
	 *
	 * No state-cookie CSRF check: Steward owns the OAuth state server-side and
	 * does not echo ours back. The HS256 JWT signature is the real authn.
	 */
	app.post("/finalize", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ ok: false, error: "BAD_JSON", message: "expected JSON body" }, 400);
		}

		const parsed = parseFinalizeBody(body);
		if (!parsed) {
			return c.json(
				{
					ok: false,
					error: "BAD_REQUEST",
					message: "expected { token: string } in body",
				},
				400,
			);
		}
		const { token } = parsed;

		const cookies = parseCookies(c.req.header("cookie") ?? "");

		const principal = await getVerifier()(token);
		if (!principal || !principal.userId) {
			return c.json(
				{
					ok: false,
					error: "INVALID_STEWARD_TOKEN",
					message: "could not verify steward jwt for tenant=waifu",
				},
				401,
			);
		}

		// Look up or auto-provision the patron row. Mirrors the requirePatron()
		// logic in middleware/patron-auth.ts so the cookie path and the bearer
		// path stay identical.
		const db = getDb();
		const existing = await db
			.select()
			.from(patronUsers)
			.where(eq(patronUsers.stewardUserId, principal.userId))
			.limit(1);

		let row = existing[0];
		if (!row) {
			const placeholder = `steward:${principal.userId}`;
			const inserted = await db
				.insert(patronUsers)
				.values({
					xUserId: placeholder,
					xHandle: placeholder,
					stewardUserId: principal.userId,
					primaryEmail: principal.email ?? null,
				})
				.returning();
			row = inserted[0];
		}
		if (!row) {
			return c.json(
				{
					ok: false,
					error: "PATRON_PROVISION_FAILED",
					message: "could not load patron row after sign-in",
				},
				500,
			);
		}

		// Sanitize return_to from cookie (frontend can't be trusted).
		const rawReturn = cookies[OAUTH_RETURN_COOKIE];
		const decodedReturn = rawReturn ? safeDecode(rawReturn) : null;
		const returnTo = sanitizeReturnTo(decodedReturn) ?? "/patron";

		const secure = (process.env.SESSION_COOKIE_SECURE ?? "true") === "true";
		const cookieOpts = getCookieOptions();

		// The session cookie carries the Steward JWT directly. `requirePatron()`
		// and the auth middleware both verify it on every request.
		const sessionCookie = buildSessionCookieHeader(token, cookieOpts);

		// Use c.header(append:true) for Set-Cookie. Returning a raw Response
		// with res.headers.append("Set-Cookie", ...) ends up dropping the
		// header on Node 22 + Hono 4.12 in production (works locally on Node
		// 24, breaks on Railway). Going through Hono's context plumbing fixes
		// it because the cors middleware materializes c.res first, and the
		// assignment-back path strips raw-response Set-Cookie entries.
		c.header("Set-Cookie", sessionCookie, { append: true });
		c.header("Set-Cookie", clearTempCookie(OAUTH_RETURN_COOKIE, secure), { append: true });
		return c.json({
			ok: true,
			data: {
				return_to: returnTo,
				patron: {
					stewardUserId: row.stewardUserId ?? principal.userId,
					email: row.primaryEmail ?? principal.email ?? null,
				},
			},
			requestId: c.get("requestId"),
		});
	});

	/**
	 * POST /auth/oauth/logout — clear the wf_session cookie.
	 *
	 * The cookie carries the Steward JWT; we don't have a server-side session
	 * row to invalidate, so logout is purely a cookie-clear.
	 */
	app.post("/logout", async (c) => {
		const cookieOpts = getCookieOptions();
		const clearParts = [`${SESSION_COOKIE_NAME}=`, "Max-Age=0", "Path=/", "HttpOnly", "SameSite=Lax"];
		if (cookieOpts.domain) clearParts.push(`Domain=${cookieOpts.domain}`);
		if (cookieOpts.secure) clearParts.push("Secure");

		c.header("Set-Cookie", clearParts.join("; "), { append: true });
		return c.json({ ok: true, data: { loggedOut: true } });
	});

	// Make sure respondOk is referenced so tree-shaking + linters don't complain
	// about an unused import. (It's exported by ../lib/http.js for parity with
	// sibling routes; keeping the import keeps future additions consistent.)
	void respondOk;

	return app;
}

// ─── Internal helpers ─────────────────────────────────────────────

function parseFinalizeBody(value: unknown): { token: string } | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	if (typeof v.token !== "string") return null;
	if (v.token.length === 0) return null;
	if (v.token.length > 4096) return null;
	return { token: v.token };
}

function safeDecode(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}
