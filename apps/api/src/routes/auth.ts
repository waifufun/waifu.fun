import { randomBytes } from "node:crypto";

import { Hono } from "hono";

import { refreshTokenSchema, siweLoginSchema } from "../contracts/auth.js";
import {
	LEGACY_LOGIN_SIWE_STATEMENT,
	LEGACY_LOGIN_SIWE_URI_PATH,
	consumeNonce,
	isProductionAuth,
	issueNonce,
	revokeRefreshTokenJti,
	signJwt,
	signRefreshToken,
	validateSiweContext,
	verifyRefreshToken,
	verifySiweMessage,
} from "../lib/auth-service.js";
import type { AppBindings } from "../lib/bindings.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { respondOk } from "../lib/http.js";
import {
	buildClearCookieHeader,
	buildSessionCookieHeader,
	createSessionForXUser,
	destroySession,
	extractSessionToken,
	getCookieOptions,
	validateSession,
} from "../lib/session.js";
import {
	buildAuthorizationUrl,
	deriveCodeChallenge,
	exchangeCodeForToken,
	fetchXUser,
	generateCodeVerifier,
	generateState,
	getTwitterOAuthConfig,
} from "../lib/twitter-oauth.js";
import { parseJsonBody } from "../lib/validation.js";
import { requireAuth } from "../middleware/auth.js";

// ── In-memory rate limiter for /twitter/login ─────────────────────────────────
// Max 10 requests per IP per 60 seconds. Good enough for demo scale.
interface RateBucket {
	count: number;
	resetAt: number;
}
const loginRateBuckets = new Map<string, RateBucket>();
const LOGIN_RATE_MAX = 10;
const LOGIN_RATE_WINDOW_MS = 60_000;

function checkLoginRateLimit(ip: string): boolean {
	const now = Date.now();
	let bucket = loginRateBuckets.get(ip);
	if (!bucket || bucket.resetAt <= now) {
		bucket = { count: 0, resetAt: now + LOGIN_RATE_WINDOW_MS };
		loginRateBuckets.set(ip, bucket);
	}
	bucket.count++;
	return bucket.count <= LOGIN_RATE_MAX;
}

// Periodically purge stale buckets to avoid memory leak
setInterval(() => {
	const now = Date.now();
	for (const [ip, bucket] of loginRateBuckets) {
		if (bucket.resetAt <= now) loginRateBuckets.delete(ip);
	}
}, 5 * 60_000).unref();

// ── Cookie names for PKCE / state ─────────────────────────────────────────────
const OAUTH_STATE_COOKIE = "wf_oauth_state";
const OAUTH_VERIFIER_COOKIE = "wf_oauth_verifier";
const OAUTH_RETURN_TO_COOKIE = "wf_oauth_return_to";
const TWITTER_FINALIZE_CODE_TTL_MS = 60_000;

interface TwitterFinalizeCode {
	sessionToken: string;
	returnToPath: string | null;
	expiresAt: number;
}

const twitterFinalizeCodes = new Map<string, TwitterFinalizeCode>();

function buildOAuthTempCookie(name: string, value: string, secure: boolean): string {
	const parts = [
		`${name}=${value}`,
		"Max-Age=600", // 10 min for the OAuth round-trip
		"Path=/auth/twitter",
		"HttpOnly",
		"SameSite=Lax",
	];
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

function clearOAuthTempCookie(name: string): string {
	return `${name}=; Max-Age=0; Path=/auth/twitter; HttpOnly; SameSite=Lax`;
}

/**
 * Only allow same-origin redirect paths on the frontend. Rejects absolute
 * URLs, protocol-relative paths, and anything not starting with "/". This
 * stops the OAuth flow from being used as an open redirect.
 */
function sanitizeReturnTo(raw: string | null | undefined): string | null {
	if (!raw) return null;
	if (raw.length > 200) return null;
	// Reject absolute (with scheme), protocol-relative (//), backslash tricks.
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
	return raw;
}

function getTwitterFinalizeUrl(): string | null {
	const raw = process.env.TWITTER_FINALIZE_URL;
	if (!raw) return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
		return url.toString();
	} catch {
		return null;
	}
}

function pruneTwitterFinalizeCodes(now = Date.now()): void {
	for (const [code, entry] of twitterFinalizeCodes) {
		if (entry.expiresAt <= now) twitterFinalizeCodes.delete(code);
	}
}

function issueTwitterFinalizeCode(sessionToken: string, returnToPath: string | null): string {
	pruneTwitterFinalizeCodes();
	const code = randomBytes(32).toString("base64url");
	twitterFinalizeCodes.set(code, {
		sessionToken,
		returnToPath,
		expiresAt: Date.now() + TWITTER_FINALIZE_CODE_TTL_MS,
	});
	return code;
}

function consumeTwitterFinalizeCode(code: string): TwitterFinalizeCode | null {
	const entry = twitterFinalizeCodes.get(code);
	twitterFinalizeCodes.delete(code);
	if (!entry || entry.expiresAt <= Date.now()) return null;
	return entry;
}

export function __issueTwitterFinalizeCodeForTest(sessionToken: string, returnToPath: string | null): string {
	return issueTwitterFinalizeCode(sessionToken, returnToPath);
}

export function __clearTwitterFinalizeCodesForTest(): void {
	twitterFinalizeCodes.clear();
}

export function __buildTwitterFinalizeRedirectForTest(code: string, returnToPath: string | null): string | null {
	return buildTwitterFinalizeRedirect(code, returnToPath);
}

function buildTwitterFinalizeRedirect(code: string, returnToPath: string | null): string | null {
	const finalizeUrl = getTwitterFinalizeUrl();
	if (!finalizeUrl) return null;
	const url = new URL(finalizeUrl);
	url.searchParams.set("code", code);
	if (returnToPath) url.searchParams.set("return_to", returnToPath);
	return url.toString();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCompatRefreshToken(address: string): string {
	return `compat-refresh:${address}`;
}

function parseCompatRefreshToken(refreshToken: string): string | null {
	const match = /^compat-(?:refresh|rotated):(0x[a-fA-F0-9]{40})$/.exec(refreshToken);
	return match?.[1] ?? null;
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createAuthRoutes() {
	const app = new Hono<AppBindings>();

	// ── Nonce endpoint (SIWE) ──────────────────────────────────────────────────
	app.get("/nonce", (c) => {
		const nonce = issueNonce();
		return respondOk(c, {
			nonce,
			statement: LEGACY_LOGIN_SIWE_STATEMENT,
			uriPath: LEGACY_LOGIN_SIWE_URI_PATH,
		});
	});

	// ── SIWE Login ─────────────────────────────────────────────────────────────
	app.post("/siwe", async (c) => {
		const input = await parseJsonBody(c, siweLoginSchema);
		const deps = c.get("deps");

		if (isProductionAuth()) {
			let verified: Awaited<ReturnType<typeof verifySiweMessage>> | undefined;
			try {
				verified = await verifySiweMessage(input.message, input.signature);
			} catch (err) {
				throw badRequest("SIWE_VERIFICATION_FAILED", err instanceof Error ? err.message : "SIWE verification failed");
			}
			const contextError = validateSiweContext(input.message, {
				expectedChainId: 56,
				expectedStatement: LEGACY_LOGIN_SIWE_STATEMENT,
				expectedUriPath: LEGACY_LOGIN_SIWE_URI_PATH,
			});
			if (contextError) {
				throw badRequest("SIWE_CONTEXT_INVALID", contextError);
			}

			if (!consumeNonce(verified.nonce)) {
				throw badRequest("INVALID_NONCE", "Nonce is invalid or expired. Request a new one via GET /auth/nonce.");
			}

			const profile = await deps.db.getCreatorProfile(verified.address);
			const accessToken = await signJwt(
				{ address: verified.address, role: "creator" },
				deps.config.auth.accessTokenTtlSeconds,
			);
			const refreshToken = await signRefreshToken(
				{ address: verified.address, role: "creator" },
				deps.config.auth.refreshTokenTtlSeconds,
			);

			return respondOk(c, {
				accessToken,
				refreshToken,
				expiresIn: deps.config.auth.accessTokenTtlSeconds,
				profile,
			});
		}

		const address = input.address ?? "0x0000000000000000000000000000000000000000";
		const profile = await deps.db.getCreatorProfile(address);

		return respondOk(c, {
			accessToken: `dev:${address}:creator`,
			refreshToken: buildCompatRefreshToken(address),
			expiresIn: deps.config.auth.accessTokenTtlSeconds,
			profile,
			notes: [
				"Dev mode: SIWE signature verification is skipped.",
				"Set NODE_ENV=production and JWT_SECRET to enable real auth.",
			],
		});
	});

	app.post("/refresh", async (c) => {
		const input = await parseJsonBody(c, refreshTokenSchema);

		if (isProductionAuth()) {
			const deps = c.get("deps");
			let payload: Awaited<ReturnType<typeof verifyRefreshToken>>;
			try {
				payload = await verifyRefreshToken(input.refreshToken);
			} catch {
				throw unauthorized("Invalid refresh token");
			}

			revokeRefreshTokenJti(payload.jti, payload.exp);

			return respondOk(c, {
				accessToken: await signJwt(
					{ address: payload.address, role: payload.role },
					deps.config.auth.accessTokenTtlSeconds,
				),
				refreshToken: await signRefreshToken(
					{ address: payload.address, role: payload.role },
					deps.config.auth.refreshTokenTtlSeconds,
				),
			});
		}

		const address = parseCompatRefreshToken(input.refreshToken);
		if (!address) {
			throw unauthorized("Invalid refresh token");
		}

		return respondOk(c, {
			accessToken: `dev:${address}:creator`,
			refreshToken: `compat-rotated:${address}`,
			notes: ["Compat refresh token rotation is deterministic and purely local."],
		});
	});

	// ── SIWE /me (existing) ────────────────────────────────────────────────────
	app.get("/me", requireAuth(), async (c) => {
		const auth = c.get("auth");
		const deps = c.get("deps");

		if (!auth) throw new Error("Auth middleware invariant violated");

		const profile = await deps.db.getCreatorProfile(auth.address);
		return respondOk(c, { auth, profile });
	});

	// ════════════════════════════════════════════════════════════════════════════
	// Twitter (X) OAuth 2.0 — patron auth
	// ════════════════════════════════════════════════════════════════════════════

	/**
	 * GET /auth/twitter/login
	 * Initiates the X OAuth PKCE flow.
	 * Sets two short-lived HttpOnly cookies: wf_oauth_state + wf_oauth_verifier.
	 * Redirects to x.com.
	 */
	app.get("/twitter/login", (c) => {
		const oauthConfig = getTwitterOAuthConfig();
		const returnTo = sanitizeReturnTo(c.req.query("return_to"));

		if (!oauthConfig) {
			// Not configured yet — return 501 with a helpful message
			return c.json(
				{
					ok: false,
					error: "TWITTER_AUTH_NOT_CONFIGURED",
					message: "X_CLIENT_ID and X_CLIENT_SECRET are not set. See README for setup instructions.",
				},
				501,
			);
		}

		// Rate limit by IP
		const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? "unknown";
		if (!checkLoginRateLimit(ip)) {
			return c.json(
				{
					ok: false,
					error: "RATE_LIMITED",
					message: "Too many login attempts. Try again shortly.",
				},
				429,
			);
		}

		const state = generateState();
		const verifier = generateCodeVerifier();
		const challenge = deriveCodeChallenge(verifier);

		const authUrl = buildAuthorizationUrl({
			clientId: oauthConfig.clientId,
			redirectUri: oauthConfig.redirectUri,
			state,
			codeChallenge: challenge,
		});

		const secure = (process.env.SESSION_COOKIE_SECURE ?? "true") === "true";

		// Store state + verifier in short-lived HttpOnly cookies
		c.res = new Response(null, {
			status: 302,
			headers: {
				Location: authUrl,
				"Set-Cookie": buildOAuthTempCookie(OAUTH_STATE_COOKIE, state, secure),
			},
		});
		// Append the second cookie (Hono doesn't de-dupe Set-Cookie)
		c.res.headers.append("Set-Cookie", buildOAuthTempCookie(OAUTH_VERIFIER_COOKIE, verifier, secure));
		// If a return_to path was provided, stash it so /callback can redirect
		// back after a successful login (e.g. "/claim/abc").
		if (returnTo) {
			c.res.headers.append(
				"Set-Cookie",
				buildOAuthTempCookie(OAUTH_RETURN_TO_COOKIE, encodeURIComponent(returnTo), secure),
			);
		}
		return c.res;
	});

	/**
	 * GET /auth/twitter/callback
	 * Exchanges the authorization code for an access token, fetches the X user,
	 * upserts a patron_users row, creates a session, and sets the session cookie.
	 * Redirects to the frontend on success.
	 */
	app.get("/twitter/callback", async (c) => {
		const oauthConfig = getTwitterOAuthConfig();

		if (!oauthConfig) {
			return c.redirect(`${process.env.FRONTEND_URL ?? "https://waifu.fun"}/?auth_error=not_configured`);
		}

		const code = c.req.query("code");
		const returnedState = c.req.query("state");
		const error = c.req.query("error");

		const cookieHeader = c.req.header("cookie") ?? "";

		// Parse temp cookies
		const cookiePairs = Object.fromEntries(
			cookieHeader.split(";").map((s) => {
				const idx = s.indexOf("=");
				return [s.slice(0, idx).trim(), s.slice(idx + 1).trim()];
			}),
		);
		const storedState = cookiePairs[OAUTH_STATE_COOKIE];
		const storedVerifier = cookiePairs[OAUTH_VERIFIER_COOKIE];
		const rawReturnTo = cookiePairs[OAUTH_RETURN_TO_COOKIE];
		const decodedReturnTo = rawReturnTo ? decodeURIComponent(rawReturnTo) : null;
		const returnToPath = sanitizeReturnTo(decodedReturnTo);
		const frontendUrl = process.env.FRONTEND_URL ?? "https://waifu.fun";

		// Clear temp cookies regardless of outcome
		const clearStateCookie = clearOAuthTempCookie(OAUTH_STATE_COOKIE);
		const clearVerifierCookie = clearOAuthTempCookie(OAUTH_VERIFIER_COOKIE);
		const clearReturnToCookie = clearOAuthTempCookie(OAUTH_RETURN_TO_COOKIE);

		const redirect = (path: string) => {
			const res = new Response(null, {
				status: 302,
				headers: { Location: `${frontendUrl}${path}` },
			});
			res.headers.append("Set-Cookie", clearStateCookie);
			res.headers.append("Set-Cookie", clearVerifierCookie);
			res.headers.append("Set-Cookie", clearReturnToCookie);
			return res;
		};

		if (error) {
			c.get("logger").error({ error }, "twitter callback returned error");
			return redirect(`/?auth_error=${encodeURIComponent(error)}`);
		}

		// CSRF: state must match
		if (!code || !returnedState || !storedState || returnedState !== storedState) {
			c.get("logger").error(
				{
					hasCode: !!code,
					hasReturnedState: !!returnedState,
					hasStoredState: !!storedState,
					match: returnedState === storedState,
				},
				"twitter callback state mismatch",
			);
			return redirect("/?auth_error=state_mismatch");
		}

		if (!storedVerifier) {
			c.get("logger").error("twitter callback missing verifier cookie");
			return redirect("/?auth_error=missing_verifier");
		}

		try {
			// Exchange code for access token
			const tokenData = await exchangeCodeForToken({
				code,
				codeVerifier: storedVerifier,
				redirectUri: oauthConfig.redirectUri,
				clientId: oauthConfig.clientId,
				clientSecret: oauthConfig.clientSecret,
			});

			// Fetch X user
			const xUser = await fetchXUser(tokenData.access_token);

			// Create session
			const sessionToken = await createSessionForXUser({
				xUserId: xUser.id,
				xHandle: xUser.username,
				xDisplayName: xUser.name ?? null,
				xAvatarUrl: xUser.profile_image_url ?? null,
			});

			// Redirect to the return_to path if provided (e.g. /claim/abc),
			// otherwise fall back to the homepage with auth=success.
			const successPath = returnToPath ?? "/?auth=success";

			const finalizeCode = getTwitterFinalizeUrl() ? issueTwitterFinalizeCode(sessionToken, successPath) : null;
			const finalizeRedirect = finalizeCode ? buildTwitterFinalizeRedirect(finalizeCode, successPath) : null;
			if (finalizeRedirect) {
				const res = new Response(null, {
					status: 302,
					headers: { Location: finalizeRedirect },
				});
				res.headers.append("Set-Cookie", clearStateCookie);
				res.headers.append("Set-Cookie", clearVerifierCookie);
				res.headers.append("Set-Cookie", clearReturnToCookie);
				c.get("logger").info(
					{ xHandle: xUser.username, returnTo: successPath },
					"twitter callback session created for same-origin finalize",
				);
				return res;
			}

			const cookieOpts = getCookieOptions();
			const sessionCookie = buildSessionCookieHeader(sessionToken, cookieOpts);
			const res = redirect(successPath);
			res.headers.append("Set-Cookie", sessionCookie);
			c.get("logger").info({ xHandle: xUser.username, returnTo: successPath }, "twitter callback session created");
			return res;
		} catch (err) {
			c.get("logger").error({ error: err }, "twitter callback failed");
			return redirect("/?auth_error=callback_failed");
		}
	});

	/**
	 * POST /auth/twitter/finalize
	 * Mirrors an already-created X OAuth session into a first-party cookie via
	 * the frontend same-origin proxy. Enabled by /twitter/callback when
	 * TWITTER_FINALIZE_URL points at the frontend finalize page.
	 */
	app.post("/twitter/finalize", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ ok: false, error: "BAD_JSON", message: "expected JSON body" }, 400);
		}

		if (!body || typeof body !== "object") {
			return c.json({ ok: false, error: "BAD_REQUEST", message: "expected { code }" }, 400);
		}

		const { code, return_to: rawReturnTo } = body as Record<string, unknown>;
		if (typeof code !== "string" || code.length === 0 || code.length > 128) {
			return c.json({ ok: false, error: "BAD_REQUEST", message: "expected { code: string }" }, 400);
		}

		const pending = consumeTwitterFinalizeCode(code);
		if (!pending) {
			return c.json({ ok: false, error: "INVALID_CODE", message: "twitter finalize code is invalid or expired" }, 401);
		}

		const session = await validateSession(pending.sessionToken).catch(() => null);
		if (!session) {
			return c.json({ ok: false, error: "INVALID_SESSION", message: "twitter session token is invalid" }, 401);
		}

		const returnTo =
			sanitizeReturnTo(typeof rawReturnTo === "string" ? rawReturnTo : null) ?? pending.returnToPath ?? "/patron";
		const cookieOpts = getCookieOptions();
		const cookieToken = session.rotated && session.newToken ? session.newToken : pending.sessionToken;

		c.header("Set-Cookie", buildSessionCookieHeader(cookieToken, cookieOpts), { append: true });
		return c.json({
			ok: true,
			data: {
				return_to: returnTo,
				user: {
					xUserId: session.user.xUserId,
					xHandle: session.user.xHandle,
					xDisplayName: session.user.xDisplayName,
					xAvatarUrl: session.user.xAvatarUrl,
				},
			},
			requestId: c.get("requestId"),
		});
	});

	/**
	 * GET /auth/twitter/me
	 * Returns the current patron user from session cookie, or null.
	 * Always 200 — null means not logged in.
	 */
	app.get("/twitter/me", async (c) => {
		const cookieHeader = c.req.header("cookie");
		const token = extractSessionToken(cookieHeader);

		if (!token) {
			return respondOk(c, { user: null });
		}

		const session = await validateSession(token).catch(() => null);

		if (!session) {
			return respondOk(c, { user: null });
		}

		// If session was rotated, issue new cookie
		if (session.rotated && session.newToken) {
			const cookieOpts = getCookieOptions();
			c.res = new Response(
				JSON.stringify({
					ok: true,
					data: {
						user: {
							xUserId: session.user.xUserId,
							xHandle: session.user.xHandle,
							xDisplayName: session.user.xDisplayName,
							xAvatarUrl: session.user.xAvatarUrl,
						},
					},
					requestId: c.get("requestId"),
				}),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"Set-Cookie": buildSessionCookieHeader(session.newToken, getCookieOptions()),
					},
				},
			);
			return c.res;
		}

		return respondOk(c, {
			user: {
				xUserId: session.user.xUserId,
				xHandle: session.user.xHandle,
				xDisplayName: session.user.xDisplayName,
				xAvatarUrl: session.user.xAvatarUrl,
			},
		});
	});

	/**
	 * POST /auth/twitter/logout
	 * Destroys the session and clears the session cookie.
	 */
	app.post("/twitter/logout", async (c) => {
		const cookieHeader = c.req.header("cookie");
		const token = extractSessionToken(cookieHeader);

		if (token) {
			await destroySession(token).catch(() => {});
		}

		const cookieOpts = getCookieOptions();
		c.res = new Response(JSON.stringify({ ok: true, data: { loggedOut: true } }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Set-Cookie": buildClearCookieHeader(cookieOpts),
			},
		});
		return c.res;
	});

	return app;
}
