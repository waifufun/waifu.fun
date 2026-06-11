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

import { createHash, randomBytes } from "node:crypto";

import { patronUsers } from "@waifufun/db";
import { getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import { respondOk } from "../lib/http.js";
import { ensurePrimaryPatronWallet, normalizeWalletChain, pickPrimaryWallet } from "../lib/patron-wallet.js";
import { sanitizeAuthReturnTo } from "../lib/redirect-safety.js";
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
// PKCE: Steward requires `response_type=code` + a code_challenge. We generate
// the verifier server-side at /start, stash it in this short-lived HttpOnly
// cookie, and read it back at /exchange to complete the code→token swap.
export const OAUTH_PKCE_COOKIE = "wf_oauth_pkce";
// Stashes the OAuth provider chosen at /start so /exchange knows which
// provider-scoped Steward token endpoint to hit (the callback URL is the
// same for every provider, so the frontend can't infer it).
export const OAUTH_PROVIDER_COOKIE = "wf_oauth_provider";
const OAUTH_TEMP_TTL_SECONDS = 600; // 10 minutes — enough for the round-trip

// ─── PKCE helpers (RFC 7636) ──────────────────────────────────────

/** Random base64url code_verifier (43 chars from 32 bytes). */
function generateCodeVerifier(): string {
	return randomBytes(32).toString("base64url");
}

/** S256 challenge: base64url(SHA-256(verifier)). */
function deriveCodeChallenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

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

function buildStewardStartUrl(provider: Provider, pkce?: { codeChallenge: string }): BuiltStartUrl {
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
	// PKCE is mandatory on Steward's OAuth authorize endpoint. The implicit
	// (`response_type=token`) flow was disabled, so without these params
	// Steward replies `code_challenge is required for response_type=code`.
	if (isOAuth && pkce) {
		url.searchParams.set("response_type", "code");
		url.searchParams.set("code_challenge", pkce.codeChallenge);
		url.searchParams.set("code_challenge_method", "S256");
	}
	return { url, redirectUri };
}

// ─── PKCE code→token exchange ─────────────────────────────────────

/**
 * Exchange a Steward authorization `code` for a session JWT using the stashed
 * PKCE `code_verifier`. Hits Steward's token endpoint
 * (`/auth/oauth/<provider>/token`) which expects `{ code, redirectUri,
 * code_verifier }` and returns the issued token.
 */
async function exchangeStewardCode(opts: {
	provider: OAuthProvider;
	code: string;
	codeVerifier: string;
	redirectUri: string;
}): Promise<{ token: string; refreshToken: string | null }> {
	const stewardBase = process.env.STEWARD_API_URL ?? "https://eliza.steward.fi";
	const tenant = process.env.STEWARD_TENANT_ID ?? "waifu";
	const tokenUrl = new URL(`/auth/oauth/${opts.provider}/token`, stewardBase);

	const res = await fetch(tokenUrl.toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			code: opts.code,
			// Steward's token endpoint reads camelCase keys (`redirectUri`,
			// `codeVerifier`, `tenantId`). Snake_case is kept as belt-and-suspenders
			// for any older Steward deploy, but camelCase is what prod parses —
			// sending only snake_case made Steward treat the exchange as tenantless
			// AND verifier-less (502 STEWARD_EXCHANGE_FAILED on every login).
			redirectUri: opts.redirectUri,
			redirect_uri: opts.redirectUri,
			codeVerifier: opts.codeVerifier,
			code_verifier: opts.codeVerifier,
			tenantId: tenant,
			tenant_id: tenant,
		}),
	});

	const json = (await res.json().catch(() => null)) as {
		token?: string;
		accessToken?: string;
		refreshToken?: string;
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
	return { token, refreshToken: json.refreshToken ?? null };
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

		const returnTo = sanitizeAuthReturnTo(c.req.query("return_to")) ?? "/patron";
		const secure = (process.env.SESSION_COOKIE_SECURE ?? "true") === "true";

		const isOAuth = (OAUTH_PROVIDERS as readonly string[]).includes(provider);

		// Generate PKCE for OAuth providers (Steward requires it). Stash the
		// verifier in a short-lived HttpOnly cookie so /exchange can complete
		// the code→token swap after Steward redirects back with ?code=.
		let pkce: { codeChallenge: string } | undefined;
		if (isOAuth) {
			const codeVerifier = generateCodeVerifier();
			pkce = { codeChallenge: deriveCodeChallenge(codeVerifier) };
			c.header("Set-Cookie", buildTempCookie(OAUTH_PKCE_COOKIE, codeVerifier, secure), {
				append: true,
			});
			c.header("Set-Cookie", buildTempCookie(OAUTH_PROVIDER_COOKIE, provider, secure), {
				append: true,
			});
		}

		const { url } = buildStewardStartUrl(provider, pkce);

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
		const { token, primaryChain } = parsed;
		return finalizeStewardToken(c, { token, primaryChain });
	});

	/**
	 * POST /auth/oauth/exchange { code, state? }
	 *
	 * PKCE code→token exchange. After Steward redirects the user back to the
	 * frontend callback with `?code=`, the frontend POSTs the code here. We
	 * read the PKCE `code_verifier` stashed in the HttpOnly `wf_oauth_pkce`
	 * cookie at /start, swap it with Steward for a session JWT, then run the
	 * same patron-provisioning + session-cookie logic as /finalize.
	 */
	app.post("/exchange", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ ok: false, error: "BAD_JSON", message: "expected JSON body" }, 400);
		}

		const v = (body ?? {}) as Record<string, unknown>;
		const code = typeof v.code === "string" ? v.code : null;
		if (!code || code.length === 0 || code.length > 4096) {
			return c.json({ ok: false, error: "BAD_REQUEST", message: "expected { code: string }" }, 400);
		}
		const cookies = parseCookies(c.req.header("cookie") ?? "");
		// Steward's token endpoint is provider-scoped. Prefer the provider stashed
		// at /start (cookie), fall back to the body if the frontend echoes it.
		const providerRaw = cookies[OAUTH_PROVIDER_COOKIE] ?? (typeof v.provider === "string" ? v.provider : "");
		const provider = (OAUTH_PROVIDERS as readonly string[]).includes(providerRaw)
			? (providerRaw as OAuthProvider)
			: null;
		if (!provider) {
			return c.json(
				{ ok: false, error: "BAD_REQUEST", message: `provider must be one of: ${OAUTH_PROVIDERS.join(", ")}` },
				400,
			);
		}

		const codeVerifier = cookies[OAUTH_PKCE_COOKIE];
		if (!codeVerifier) {
			return c.json(
				{
					ok: false,
					error: "MISSING_PKCE_VERIFIER",
					message: "pkce verifier cookie missing or expired — start sign-in again",
				},
				400,
			);
		}

		const frontendBase = process.env.FRONTEND_URL ?? "https://waifu.fun";
		const redirectUri = `${frontendBase}/auth/oauth/callback`;

		let exchanged: { token: string; refreshToken: string | null };
		try {
			exchanged = await exchangeStewardCode({ provider, code, codeVerifier, redirectUri });
		} catch (err) {
			console.warn("[oauth/exchange] steward token exchange failed", err);
			return c.json(
				{
					ok: false,
					error: "STEWARD_EXCHANGE_FAILED",
					message: err instanceof Error ? err.message : "steward token exchange failed",
				},
				502,
			);
		}

		// Clear the one-time PKCE + provider cookies now that they've been consumed.
		const secure = (process.env.SESSION_COOKIE_SECURE ?? "true") === "true";
		c.header("Set-Cookie", clearTempCookie(OAUTH_PKCE_COOKIE, secure), { append: true });
		c.header("Set-Cookie", clearTempCookie(OAUTH_PROVIDER_COOKIE, secure), { append: true });

		return finalizeStewardToken(c, { token: exchanged.token, primaryChain: normalizeWalletChain(undefined) });
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

/**
 * Shared post-token finalize: verify the Steward JWT, upsert/provision the
 * patron row, bind the wf_session cookie, and return the sanitized
 * return_to + patron summary. Used by BOTH /finalize (token-based wallet /
 * legacy flow) and /exchange (PKCE code-based OAuth flow).
 */
async function finalizeStewardToken(
	c: Context<AppBindings>,
	opts: { token: string; primaryChain: ReturnType<typeof normalizeWalletChain> },
): Promise<Response> {
	const { token, primaryChain } = opts;
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
	const existing = await db.select().from(patronUsers).where(eq(patronUsers.stewardUserId, principal.userId)).limit(1);

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

	const primaryWallet = pickPrimaryWallet(principal, primaryChain);
	if (primaryWallet) {
		// Best-effort: a first-time wallet sign-in racing with itself can
		// hit the unique constraint on patron_wallets.address. The session
		// is still valid in that case, so don't fail the whole finalize.
		// Matches the pattern in the auth middleware path.
		try {
			await ensurePrimaryPatronWallet(db, row.id, primaryWallet);
		} catch (err) {
			console.warn("[oauth/finalize] ensurePrimaryPatronWallet failed (best-effort)", err);
		}
	}

	// Sanitize return_to from cookie (frontend can't be trusted).
	const rawReturn = cookies[OAUTH_RETURN_COOKIE];
	const decodedReturn = rawReturn ? safeDecode(rawReturn) : null;
	const returnTo = sanitizeAuthReturnTo(decodedReturn) ?? "/patron";

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
				primaryAddress: primaryWallet?.address ?? null,
				primaryChain: primaryWallet?.chain ?? null,
			},
		},
		requestId: c.get("requestId"),
	});
}

function parseFinalizeBody(
	value: unknown,
): { token: string; primaryChain: ReturnType<typeof normalizeWalletChain> } | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	if (typeof v.token !== "string") return null;
	if (v.token.length === 0) return null;
	if (v.token.length > 4096) return null;
	return { token: v.token, primaryChain: normalizeWalletChain(v.primaryChain) };
}

function safeDecode(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}
