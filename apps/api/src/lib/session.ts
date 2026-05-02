/**
 * session.ts
 * CRUD for patron_sessions using Drizzle + the shared @waifufun/db connection.
 * Tables are defined inline here so we don't need a separate @waifufun/db rebuild step
 * for every column tweak.
 */

import { randomBytes } from "node:crypto";

import { getDatabase } from "@waifufun/db";
import { patronSessions, patronUsers } from "@waifufun/db";
import { eq, sql } from "drizzle-orm";

// ── Config ────────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_ROTATION_AGE_MS = 24 * 60 * 60 * 1000; // rotate if >24 h old
export const SESSION_COOKIE_NAME = "wf_session";

// ── Token generation ──────────────────────────────────────────────────────────

function generateSessionToken(): string {
	return randomBytes(32).toString("base64url");
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function getDb() {
	return getDatabase().db;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SessionUser {
	id: string;
	xUserId: string;
	xHandle: string;
	xDisplayName: string | null;
	xAvatarUrl: string | null;
}

/**
 * Upsert a patron user by X user ID and create a fresh session.
 * Returns the session token to set as a cookie.
 */
export async function createSessionForXUser(xUser: {
	xUserId: string;
	xHandle: string;
	xDisplayName: string | null;
	xAvatarUrl: string | null;
}): Promise<string> {
	const db = getDb();
	const now = new Date();

	// Upsert patron_users
	const [user] = await db
		.insert(patronUsers)
		.values({
			xUserId: xUser.xUserId,
			xHandle: xUser.xHandle,
			xDisplayName: xUser.xDisplayName,
			xAvatarUrl: xUser.xAvatarUrl,
		})
		.onConflictDoUpdate({
			target: patronUsers.xUserId,
			set: {
				xHandle: xUser.xHandle,
				xDisplayName: xUser.xDisplayName,
				xAvatarUrl: xUser.xAvatarUrl,
				updatedAt: now,
			},
		})
		.returning({ id: patronUsers.id });

	if (!user) throw new Error("Failed to upsert patron user");

	const token = generateSessionToken();
	const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

	await db.insert(patronSessions).values({
		id: token,
		userId: user.id,
		expiresAt,
		createdAt: now,
	});

	return token;
}

export interface ValidatedSession {
	sessionToken: string;
	user: SessionUser;
	/** If true, caller should set a new session cookie with the rotated token. */
	rotated: boolean;
	newToken?: string;
}

/**
 * Validate a session token and return the associated patron user.
 * Rotates the session token if it's older than SESSION_ROTATION_AGE_MS.
 */
export async function validateSession(token: string): Promise<ValidatedSession | null> {
	if (!token || token.length > 256) return null;

	const db = getDb();
	const now = new Date();

	const rows = await db
		.select({
			sessionId: patronSessions.id,
			sessionCreatedAt: patronSessions.createdAt,
			sessionExpiresAt: patronSessions.expiresAt,
			userId: patronUsers.id,
			xUserId: patronUsers.xUserId,
			xHandle: patronUsers.xHandle,
			xDisplayName: patronUsers.xDisplayName,
			xAvatarUrl: patronUsers.xAvatarUrl,
		})
		.from(patronSessions)
		.innerJoin(patronUsers, eq(patronSessions.userId, patronUsers.id))
		.where(eq(patronSessions.id, token))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	// Expired?
	if (row.sessionExpiresAt <= now) {
		await db.delete(patronSessions).where(eq(patronSessions.id, token));
		return null;
	}

	const user: SessionUser = {
		id: row.userId,
		xUserId: row.xUserId,
		xHandle: row.xHandle,
		xDisplayName: row.xDisplayName,
		xAvatarUrl: row.xAvatarUrl,
	};

	// Should we rotate?
	const ageMs = now.getTime() - row.sessionCreatedAt.getTime();
	if (ageMs > SESSION_ROTATION_AGE_MS) {
		const newToken = generateSessionToken();
		const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

		// Insert new session then delete old one (atomic-ish)
		await db.insert(patronSessions).values({
			id: newToken,
			userId: row.userId,
			expiresAt,
			createdAt: now,
		});
		await db.delete(patronSessions).where(eq(patronSessions.id, token));

		return { sessionToken: newToken, user, rotated: true, newToken };
	}

	return { sessionToken: token, user, rotated: false };
}

/** Delete a session by token. */
export async function destroySession(token: string): Promise<void> {
	const db = getDb();
	await db.delete(patronSessions).where(eq(patronSessions.id, token));
}

/** Periodic cleanup: delete expired sessions. Call from a background job or ad-hoc. */
export async function pruneExpiredSessions(): Promise<number> {
	const db = getDb();
	const result = await db.delete(patronSessions).where(sql`${patronSessions.expiresAt} < NOW()`);
	return (result as unknown as { count?: number }).count ?? 0;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export interface CookieOptions {
	domain: string;
	secure: boolean;
}

export function buildSessionCookieHeader(token: string, opts: CookieOptions): string {
	const maxAge = Math.floor(SESSION_TTL_MS / 1000);
	const parts = [`${SESSION_COOKIE_NAME}=${token}`, `Max-Age=${maxAge}`, "Path=/", "HttpOnly", "SameSite=Lax"];
	if (opts.domain) parts.push(`Domain=${opts.domain}`);
	if (opts.secure) parts.push("Secure");
	return parts.join("; ");
}

export function buildClearCookieHeader(opts: CookieOptions): string {
	const parts = [`${SESSION_COOKIE_NAME}=`, "Max-Age=0", "Path=/", "HttpOnly", "SameSite=Lax"];
	if (opts.domain) parts.push(`Domain=${opts.domain}`);
	if (opts.secure) parts.push("Secure");
	return parts.join("; ");
}

export function getCookieOptions(): CookieOptions {
	return {
		domain: process.env.SESSION_COOKIE_DOMAIN ?? ".waifu.fun",
		secure: (process.env.SESSION_COOKIE_SECURE ?? "true") === "true",
	};
}

/** Parse a cookie header string and return the session token, if present. */
export function extractSessionToken(cookieHeader: string | null | undefined): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key?.trim() === SESSION_COOKIE_NAME) {
			return rest.join("=").trim() || null;
		}
	}
	return null;
}
