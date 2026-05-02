/**
 * Email magic-link bridge (W9.11).
 *
 * Steward exposes its email auth as JSON POST endpoints (NOT redirect-based
 * like OAuth). This route group proxies them so the waifu frontend has a
 * cohesive `/auth/email/*` surface.
 *
 *   1. POST /auth/email/start { email, return_to? }
 *      → Forwards to Steward POST /auth/email/send.
 *      → Steward sends the magic-link email. Because tenant `waifu` has
 *        magicLinkBaseUrl=https://waifu.fun configured (Steward PR #28),
 *        the link in the email points back at /auth/email/verify on the
 *        frontend, NOT at Steward.
 *      → We persist `return_to` in a short-lived signed cookie so the
 *        verify page can pick it up after the user clicks the link.
 *
 *   2. POST /auth/email/finalize { token, email }
 *      → Frontend's /auth/email/verify page calls this with the magic-link
 *        token + email pulled from the URL.
 *      → We forward to Steward POST /auth/email/verify and get back a JWT.
 *      → We auto-provision the patron row (mirrors the OAuth path), set the
 *        long-lived `wf_session` cookie, and return the sanitized `return_to`.
 *
 * Why proxy instead of calling Steward directly from the frontend?
 *  - Steward CORS is set up but request rate-limits + abuse signals are
 *    cleaner if we own the surface.
 *  - The session cookie has to be set under `api.waifu.fun` to be readable
 *    on subsequent backend requests.
 *  - We can keep the Steward API key + URL out of the browser entirely.
 */

import { patronUsers } from "@waifufun/db";
import { getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import { SESSION_COOKIE_NAME, buildSessionCookieHeader, getCookieOptions } from "../lib/session.js";
import { verifyStewardJwt } from "../middleware/steward-auth.js";

// ─── Cookie naming + helpers ──────────────────────────────────────

export const EMAIL_RETURN_COOKIE = "wf_email_return";
const EMAIL_RETURN_TTL_SECONDS = 30 * 60; // 30 min — covers slow inbox check

function buildReturnCookie(value: string, secure: boolean): string {
	const parts = [
		`${EMAIL_RETURN_COOKIE}=${value}`,
		`Max-Age=${EMAIL_RETURN_TTL_SECONDS}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
	];
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

function clearReturnCookie(secure: boolean): string {
	const parts = [`${EMAIL_RETURN_COOKIE}=`, "Max-Age=0", "Path=/", "HttpOnly", "SameSite=Lax"];
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

function parseCookies(header: string): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(";")) {
		const idx = part.indexOf("=");
		if (idx < 0) continue;
		const key = part.slice(0, idx).trim();
		const value = part.slice(idx + 1).trim();
		if (key) out[key] = value;
	}
	return out;
}

function safeDecode(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

function sanitizeReturnTo(raw: string | null | undefined): string | null {
	if (!raw) return null;
	if (raw.length > 200) return null;
	if (!raw.startsWith("/")) return null;
	if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
	return raw;
}

// Permissive enough for dotted/+aliased addresses; tight enough to reject
// obvious garbage. Steward will do its own validation downstream.
const EMAIL_RE = /^[^\s@]{1,128}@[^\s@]{1,128}\.[^\s@]{1,32}$/;

function isEmail(value: unknown): value is string {
	return typeof value === "string" && EMAIL_RE.test(value.trim());
}

// ─── Test injection hooks ─────────────────────────────────────────

type StewardVerifier = typeof verifyStewardJwt;
type DbHandle = ReturnType<typeof getDatabase>["db"];
type StewardCallable = (
	path: string,
	init: { method: "POST"; body: unknown },
) => Promise<{ status: number; body: unknown }>;

let stewardVerifierForTest: StewardVerifier | undefined;
let dbForTest: DbHandle | undefined;
let stewardClientForTest: StewardCallable | undefined;

export function __setEmailStewardVerifierForTest(verifier: StewardVerifier | undefined): void {
	stewardVerifierForTest = verifier;
}

export function __setEmailDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}

export function __setEmailStewardClientForTest(client: StewardCallable | undefined): void {
	stewardClientForTest = client;
}

function getDb(): DbHandle {
	return dbForTest ?? getDatabase().db;
}

function getVerifier(): StewardVerifier {
	return stewardVerifierForTest ?? verifyStewardJwt;
}

async function callSteward(path: string, body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
	if (stewardClientForTest) {
		return stewardClientForTest(path, { method: "POST", body });
	}

	const stewardBase = process.env.STEWARD_API_URL ?? "https://eliza.steward.fi";
	const tenant = process.env.STEWARD_TENANT_ID ?? "waifu";
	const url = `${stewardBase.replace(/\/$/, "")}${path}`;

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Steward-Tenant": tenant,
		},
		body: JSON.stringify({ ...body, tenantId: tenant }),
	});

	let json: unknown = null;
	try {
		json = await res.json();
	} catch {
		json = null;
	}
	return { status: res.status, body: json };
}

// ─── Router ───────────────────────────────────────────────────────

export function createEmailAuthRoutes() {
	const app = new Hono<AppBindings>();

	/**
	 * POST /auth/email/start { email, return_to? }
	 *
	 * Sends the magic-link email via Steward and parks `return_to` in a
	 * short-lived cookie for the verify step to pick up.
	 */
	app.post("/start", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ ok: false, error: "BAD_JSON", message: "expected JSON body" }, 400);
		}

		const v = (body ?? {}) as Record<string, unknown>;
		if (!isEmail(v.email)) {
			return c.json({ ok: false, error: "BAD_EMAIL", message: "expected { email: string } in body" }, 400);
		}
		const email = (v.email as string).trim().toLowerCase();
		const returnTo = typeof v.return_to === "string" ? sanitizeReturnTo(v.return_to) : null;

		const upstream = await callSteward("/auth/email/send", { email });
		if (upstream.status >= 400) {
			// Pass through Steward's error verbatim where it's safe; otherwise
			// map to a generic 502 so we don't leak internals.
			const errBody =
				upstream.status === 429
					? { ok: false, error: "RATE_LIMITED", message: "too many email requests" }
					: { ok: false, error: "EMAIL_SEND_FAILED", message: "could not send magic link" };
			return c.json(errBody, upstream.status === 429 ? 429 : 502);
		}

		const data =
			upstream.body && typeof upstream.body === "object"
				? (upstream.body as { data?: { expiresAt?: string } }).data
				: undefined;

		const secure = (process.env.SESSION_COOKIE_SECURE ?? "true") === "true";
		if (returnTo) {
			c.header("Set-Cookie", buildReturnCookie(encodeURIComponent(returnTo), secure), {
				append: true,
			});
		}
		return c.json({
			ok: true,
			data: {
				email,
				expiresAt: data?.expiresAt ?? null,
			},
			requestId: c.get("requestId"),
		});
	});

	/**
	 * POST /auth/email/finalize { token, email }
	 *
	 * Called by the frontend's /auth/email/verify page after the user clicks
	 * the magic link. Verifies the token via Steward, mints the wf_session
	 * cookie, auto-provisions the patron row.
	 */
	app.post("/finalize", async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ ok: false, error: "BAD_JSON", message: "expected JSON body" }, 400);
		}
		const v = (body ?? {}) as Record<string, unknown>;
		if (typeof v.token !== "string" || v.token.length === 0 || v.token.length > 4096) {
			return c.json({ ok: false, error: "BAD_TOKEN", message: "expected { token: string }" }, 400);
		}
		if (!isEmail(v.email)) {
			return c.json({ ok: false, error: "BAD_EMAIL", message: "expected { email: string }" }, 400);
		}
		const token = v.token;
		const email = (v.email as string).trim().toLowerCase();

		const upstream = await callSteward("/auth/email/verify", { token, email });
		if (upstream.status >= 400) {
			return c.json({ ok: false, error: "INVALID_MAGIC_LINK", message: "invalid or expired magic link" }, 401);
		}

		// Steward's POST /auth/email/verify response shape is FLAT, not
		// nested under `data`:
		//   { ok, token, refreshToken, expiresIn, user }
		// (see buildAuthResponse in steward-fi packages/api/src/routes/auth.ts)
		const upstreamBody = (upstream.body ?? {}) as {
			ok?: boolean;
			token?: string;
			refreshToken?: string;
			// Older / hypothetical nested shape — supported as a fallback.
			data?: { token?: string; refreshToken?: string };
		};
		const stewardJwt = upstreamBody.token ?? upstreamBody.data?.token;
		if (typeof stewardJwt !== "string" || stewardJwt.length === 0) {
			return c.json(
				{
					ok: false,
					error: "UPSTREAM_BAD_SHAPE",
					message: "steward did not return a token",
				},
				502,
			);
		}

		const principal = await getVerifier()(stewardJwt);
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

		// Auto-provision patron (mirrors oauth.ts /finalize).
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
					primaryEmail: principal.email ?? email,
				})
				.returning();
			row = inserted[0];
		} else if (!row.primaryEmail && (principal.email || email)) {
			// Backfill primary email on first email-auth sign-in.
			const updated = await db
				.update(patronUsers)
				.set({ primaryEmail: principal.email ?? email })
				.where(eq(patronUsers.stewardUserId, principal.userId))
				.returning();
			row = updated[0] ?? row;
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

		// Pick up return_to from the cookie set in /start, if it's still around.
		const cookies = parseCookies(c.req.header("cookie") ?? "");
		const rawReturn = cookies[EMAIL_RETURN_COOKIE];
		const decodedReturn = rawReturn ? safeDecode(rawReturn) : null;
		const returnTo = sanitizeReturnTo(decodedReturn) ?? "/patron";

		const secure = (process.env.SESSION_COOKIE_SECURE ?? "true") === "true";
		const cookieOpts = getCookieOptions();
		const sessionCookie = buildSessionCookieHeader(stewardJwt, cookieOpts);

		// Use c.header(append:true) for Set-Cookie — see oauth.ts comment for
		// why raw Response.headers.append doesn't survive Hono on Node 22 prod.
		c.header("Set-Cookie", sessionCookie, { append: true });
		c.header("Set-Cookie", clearReturnCookie(secure), { append: true });
		void SESSION_COOKIE_NAME;
		return c.json({
			ok: true,
			data: {
				return_to: returnTo,
				patron: {
					stewardUserId: row.stewardUserId ?? principal.userId,
					email: row.primaryEmail ?? principal.email ?? email,
				},
			},
			requestId: c.get("requestId"),
		});
	});

	return app;
}
