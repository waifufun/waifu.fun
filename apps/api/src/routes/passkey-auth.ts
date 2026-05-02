/**
 * Passkey (WebAuthn) bridge to Steward (W9.12).
 *
 * Unlike OAuth and email magic-link, the WebAuthn dance is entirely
 * client-side. The browser talks directly to Steward's POST endpoints:
 *
 *   POST /passkey/register/options   — get registration challenge
 *   POST /passkey/register/verify    — finish registration, returns JWT
 *   POST /passkey/login/options      — get authentication challenge
 *   POST /passkey/login/verify       — finish authentication, returns JWT
 *
 * After the browser obtains the Steward JWT from /verify, it POSTs it to
 * THIS endpoint (`/auth/passkey/finalize`) so we can:
 *   - re-verify the JWT (issuer + tenant + signature)
 *   - upsert the patron_users row (mirrors oauth.ts + email-auth.ts paths)
 *   - set the long-lived `wf_session` cookie under api.waifu.fun
 *
 * Why not let the browser hit Steward directly with no bridge? Because the
 * session cookie has to be set on the api.waifu.fun origin, and we want the
 * patron row to exist in waifu-core's DB so authenticated routes work
 * without an extra round-trip.
 */

import { patronUsers } from "@waifufun/db";
import { getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import { SESSION_COOKIE_NAME, buildSessionCookieHeader, getCookieOptions } from "../lib/session.js";
import { verifyStewardJwt } from "../middleware/steward-auth.js";

// ─── Test injection hooks ─────────────────────────────────────────

type StewardVerifier = typeof verifyStewardJwt;
type DbHandle = ReturnType<typeof getDatabase>["db"];

let stewardVerifierForTest: StewardVerifier | undefined;
let dbForTest: DbHandle | undefined;

export function __setPasskeyStewardVerifierForTest(verifier: StewardVerifier | undefined): void {
	stewardVerifierForTest = verifier;
}

export function __setPasskeyDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}

function getDb(): DbHandle {
	return dbForTest ?? getDatabase().db;
}

function getVerifier(): StewardVerifier {
	return stewardVerifierForTest ?? verifyStewardJwt;
}

function sanitizeReturnTo(raw: string | null | undefined): string | null {
	if (!raw) return null;
	if (raw.length > 200) return null;
	if (!raw.startsWith("/")) return null;
	if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
	return raw;
}

const EMAIL_RE = /^[^\s@]{1,128}@[^\s@]{1,128}\.[^\s@]{1,32}$/;

function parseFinalizeBody(value: unknown): {
	token: string;
	email?: string;
	return_to?: string;
} | null {
	if (!value || typeof value !== "object") return null;
	const v = value as Record<string, unknown>;
	if (typeof v.token !== "string" || v.token.length === 0 || v.token.length > 4096) {
		return null;
	}
	const out: { token: string; email?: string; return_to?: string } = { token: v.token };
	if (typeof v.email === "string" && EMAIL_RE.test(v.email.trim())) {
		out.email = v.email.trim().toLowerCase();
	}
	if (typeof v.return_to === "string") {
		const sanitized = sanitizeReturnTo(v.return_to);
		if (sanitized) out.return_to = sanitized;
	}
	return out;
}

// ─── Router ───────────────────────────────────────────────────────

export function createPasskeyAuthRoutes() {
	const app = new Hono<AppBindings>();

	/**
	 * POST /auth/passkey/finalize { token, email?, return_to? }
	 *
	 * Called by the frontend AFTER the browser successfully completes
	 * passkey/register/verify or passkey/login/verify with Steward and
	 * obtains a session token.
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
					message: "expected { token: string, email?: string, return_to?: string }",
				},
				400,
			);
		}
		const { token, email, return_to } = parsed;

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

		// Auto-provision / load patron (mirrors oauth.ts + email-auth.ts).
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
					primaryEmail: principal.email ?? email ?? null,
				})
				.returning();
			row = inserted[0];
		} else if (!row.primaryEmail && (principal.email || email)) {
			const newEmail = principal.email ?? email;
			if (newEmail) {
				const updated = await db
					.update(patronUsers)
					.set({ primaryEmail: newEmail })
					.where(eq(patronUsers.stewardUserId, principal.userId))
					.returning();
				row = updated[0] ?? row;
			}
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

		const cookieOpts = getCookieOptions();
		const sessionCookie = buildSessionCookieHeader(token, cookieOpts);

		const safeReturn = return_to ?? "/patron";
		// Use c.header(append:true) for Set-Cookie — see oauth.ts comment
		// for why raw Response.headers.append doesn't survive Hono in prod.
		c.header("Set-Cookie", sessionCookie, { append: true });
		void SESSION_COOKIE_NAME;
		return c.json({
			ok: true,
			data: {
				return_to: safeReturn,
				patron: {
					stewardUserId: row.stewardUserId ?? principal.userId,
					email: row.primaryEmail ?? principal.email ?? email ?? null,
				},
			},
			requestId: c.get("requestId"),
		});
	});

	return app;
}
