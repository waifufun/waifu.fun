/**
 * agent-or-patron-auth.ts
 *
 * Wave J: dual-auth middleware for the wave H launch endpoints.
 *
 * The launch routes (`POST /v2/launches/nonce`, `POST /v2/launches`) used to
 * be patron-only (Steward JWT). For agent self-launch (skill.md v2.0), we
 * also need to accept agent api keys (`agk_...`). This middleware tries the
 * agent path first, then falls back to the steward path. In both cases it
 * sets `c.var.patron` with the SAME shape so downstream handlers (rate-limit,
 * SIWE validator, launch service) work unchanged.
 *
 * Behaviour:
 *   1. If the bearer is a well-formed `agk_...` key, look it up. If valid,
 *      resolve the agent's owner-patron and attach it as `c.var.patron`.
 *      `c.var.authMode` becomes `"agent"`.
 *   2. Otherwise, fall back to `requirePatron()` (Steward JWT or wf_session
 *      cookie). On success, `c.var.authMode` becomes `"patron"`.
 *   3. If both fail → 401.
 *
 * If both an `agk_` bearer and a Steward JWT are presented, the agent path
 * wins (the Authorization header is parsed once, and `agk_` is detected
 * lexically).
 */

import { agentPersonas, getDatabase, patronUsers } from "@waifufun/db";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import { lookupByRawKey, markUsed } from "../lib/agent-keys.js";
import { type PatronContext, type RequirePatronBindings, requirePatron } from "./patron-auth.js";

// ─── Test-injection hooks ──────────────────────────────────────────

type DbHandle = ReturnType<typeof getDatabase>["db"];

let dbForTest: DbHandle | undefined;

export function __setAgentOrPatronDbForTest(db: DbHandle | undefined): void {
	dbForTest = db;
}

function getDb(): DbHandle | null {
	if (dbForTest) return dbForTest;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

// ─── Types ─────────────────────────────────────────────────────────

export type AuthMode = "agent" | "patron";

export type RequireAgentOrPatronBindings = RequirePatronBindings & {
	Variables: RequirePatronBindings["Variables"] & {
		authMode: AuthMode;
	};
};

// ─── Helpers ───────────────────────────────────────────────────────

const AGENT_KEY_PREFIX = "agk_";

function extractBearer(authHeader: string | undefined): string | null {
	if (!authHeader) return null;
	if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
	const raw = authHeader.slice(7).trim();
	return raw.length > 0 ? raw : null;
}

function looksLikeAgentKey(raw: string | null): boolean {
	return raw?.startsWith(AGENT_KEY_PREFIX) ?? false;
}

// ─── requireAgentOrPatron ──────────────────────────────────────────

/**
 * Accepts EITHER a Steward JWT (existing patron path) OR a valid agent api
 * key (the agent maps to its owner-patron). On success, attaches:
 *   - `c.var.patron` ........ the patron context (always the owning patron)
 *   - `c.var.authMode` ...... `"agent"` or `"patron"`
 *
 * Failure modes:
 *   - No usable auth header (and no wf_session cookie) → 401.
 *   - Invalid `agk_` key → 401.
 *   - Valid `agk_` key but the owning patron cannot be resolved → 403
 *     (`AGENT_OWNER_PATRON_NOT_FOUND`).
 *   - Bad Steward JWT → 401 (delegated to `requirePatron()`).
 */
export function requireAgentOrPatron(): MiddlewareHandler<RequireAgentOrPatronBindings> {
	return async (c, next) => {
		const rawBearer = extractBearer(c.req.header("authorization") ?? c.req.header("Authorization"));
		const explicitAgentHeader = c.req.header("x-agent-api-key")?.trim();

		// agent path: prefer X-Agent-Api-Key header, then `agk_`-prefixed bearer.
		let agentRaw: string | null = null;
		if (explicitAgentHeader && explicitAgentHeader.length > 0) {
			agentRaw = explicitAgentHeader;
		} else if (rawBearer && looksLikeAgentKey(rawBearer)) {
			agentRaw = rawBearer;
		}

		if (agentRaw !== null) {
			const db = getDb();
			if (!db) {
				return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "Database not configured" }, 503);
			}

			const keyRow = await lookupByRawKey(db, agentRaw).catch(() => null);
			if (!keyRow) {
				return c.json({ ok: false, error: "AGENT_AUTH_INVALID", message: "Invalid or revoked agent api key" }, 401);
			}

			// Resolve the agent persona + its owner-patron.
			const [agent] = await db
				.select({
					id: agentPersonas.id,
					agentId: agentPersonas.agentId,
					ownerStewardUserId: agentPersonas.ownerStewardUserId,
					ownerAddress: agentPersonas.ownerAddress,
				})
				.from(agentPersonas)
				.where(eq(agentPersonas.agentId, keyRow.agentId))
				.limit(1);

			if (!agent) {
				return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: "Agent for this key no longer exists" }, 401);
			}

			const ownerStewardUserId = agent.ownerStewardUserId;
			if (!ownerStewardUserId) {
				return c.json(
					{
						ok: false,
						error: "AGENT_OWNER_PATRON_NOT_FOUND",
						message: "agent has no owning patron (owner_steward_user_id is null)",
					},
					403,
				);
			}

			const [patronRow] = await db
				.select()
				.from(patronUsers)
				.where(eq(patronUsers.stewardUserId, ownerStewardUserId))
				.limit(1);

			if (!patronRow) {
				return c.json(
					{
						ok: false,
						error: "AGENT_OWNER_PATRON_NOT_FOUND",
						message: "owning patron row not found for this agent",
					},
					403,
				);
			}

			// Fire-and-forget last-used update.
			markUsed(db, keyRow.id).catch(() => {
				/* non-critical */
			});

			const patronContext: PatronContext = {
				id: patronRow.id,
				stewardUserId: patronRow.stewardUserId ?? ownerStewardUserId,
				email: patronRow.primaryEmail ?? null,
				primaryAddress: agent.ownerAddress ? agent.ownerAddress.toLowerCase() : null,
				primaryChain: null,
			};

			c.set("patron", patronContext);
			c.set("authMode", "agent");
			await next();
			return;
		}

		// patron path: delegate to the existing Steward middleware.
		// We mark the auth mode BEFORE calling next() inside requirePatron's flow
		// by piggy-backing on a wrapper. The middleware may short-circuit with a
		// Response (e.g. 401), so we return whatever it returns.
		const patronMw = requirePatron();
		return patronMw(c as never, async () => {
			c.set("authMode", "patron");
			await next();
		});
	};
}
