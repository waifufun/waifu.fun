/**
 * agent-auth.ts
 *
 * Middleware that gates `POST /v2/agents/launch` behind an agent API key.
 * Only agents with a valid, non-revoked key may launch. Humans reading
 * from the frontend do not have these keys.
 *
 * Usage:
 *   import { requireAgentAuth } from "../middleware/agent-auth.js";
 *   app.post("/launch", requireAgentAuth(), async (c) => {
 *     const authed = c.get("authedAgent"); // { agentId, keyId, scopes }
 *     ...
 *   });
 */

import { agentPersonas, getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import { lookupByRawKey, markUsed } from "../lib/agent-keys.js";
import type { AppBindings } from "../lib/bindings.js";

let agentAuthDbForTest: ReturnType<typeof getDatabase>["db"] | undefined;

export function __setAgentAuthDbForTest(db: ReturnType<typeof getDatabase>["db"] | undefined): void {
	agentAuthDbForTest = db;
}

function requireDrizzle(): ReturnType<typeof getDatabase>["db"] | null {
	if (agentAuthDbForTest) return agentAuthDbForTest;
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

export interface AuthedAgent {
	agentId: string;
	keyId: string;
	scopes: string[];
}

export type AgentAuthBindings = AppBindings & {
	Variables: AppBindings["Variables"] & {
		authedAgent: AuthedAgent;
	};
};

function extractRawKey(authHeader: string | undefined, agentKeyHeader: string | undefined): string | null {
	// Prefer explicit X-Agent-Api-Key header
	if (agentKeyHeader && agentKeyHeader.trim().length > 0) {
		return agentKeyHeader.trim();
	}
	// Fallback: Authorization: Bearer <key>
	if (authHeader?.toLowerCase().startsWith("bearer ")) {
		return authHeader.slice(7).trim();
	}
	return null;
}

export function requireAgentAuth(): MiddlewareHandler<AgentAuthBindings> {
	return async (c, next) => {
		const raw = extractRawKey(c.req.header("authorization"), c.req.header("x-agent-api-key"));

		if (!raw) {
			return c.json(
				{
					ok: false,
					error: "AGENT_AUTH_MISSING",
					message: "Agent API key required. Set Authorization: Bearer <agk_...> or X-Agent-Api-Key: <agk_...>.",
				},
				401,
			);
		}

		const db = requireDrizzle();
		if (!db) {
			return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "Database not configured" }, 503);
		}

		const keyRow = await lookupByRawKey(db, raw).catch(() => null);
		if (!keyRow) {
			return c.json({ ok: false, error: "AGENT_AUTH_INVALID", message: "Invalid or revoked agent API key" }, 401);
		}

		// Verify the agent still exists
		const [agent] = await db
			.select({ agentId: agentPersonas.agentId, tokenAddress: agentPersonas.tokenAddress })
			.from(agentPersonas)
			.where(eq(agentPersonas.agentId, keyRow.agentId))
			.limit(1);

		if (!agent) {
			return c.json({ ok: false, error: "AGENT_NOT_FOUND", message: "Agent for this key no longer exists" }, 401);
		}

		// Update last-used (fire and forget — don't block the launch on this)
		markUsed(db, keyRow.id).catch(() => {
			/* ignore; not critical */
		});

		c.set("authedAgent", {
			agentId: keyRow.agentId,
			keyId: keyRow.id,
			scopes: keyRow.scopes,
		});

		await next();
	};
}

/**
 * Helper for launch handlers. Verifies that if the request body carries
 * an agentId, it matches the authed agent. Returns an error response if
 * mismatch, otherwise null.
 *
 * Pattern in handler:
 *   const err = ensureAgentIdMatches(c, body.agentId);
 *   if (err) return err;
 */
export function ensureAgentIdMatches(
	c: Parameters<MiddlewareHandler<AgentAuthBindings>>[0],
	bodyAgentId: string | undefined,
): Response | null {
	const authed = c.get("authedAgent");
	if (!authed) {
		// Middleware not applied; shouldn't happen but fail closed.
		return c.json({ ok: false, error: "AGENT_AUTH_MISSING", message: "No authed agent in context" }, 401);
	}
	if (bodyAgentId && bodyAgentId !== authed.agentId) {
		return c.json(
			{
				ok: false,
				error: "AGENT_ID_MISMATCH",
				message: `Request body agentId (${bodyAgentId}) does not match the authed agent (${authed.agentId}).`,
			},
			403,
		);
	}
	return null;
}
