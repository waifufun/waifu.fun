/**
 * admin-keys.ts
 *
 * Admin endpoints for issuing / revoking / listing agent API keys.
 * Gated by a simple bearer token matching the `ADMIN_API_KEY` env var.
 * Separate from the wallet-SIWE admin routes in admin.ts.
 *
 * Operator usage:
 *   curl -X POST https://api.waifu.fun/admin/agent-keys \
 *     -H "Authorization: Bearer $ADMIN_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"agentId":"waifu-demo-agent"}'
 */

import { agentPersonas, getDatabase } from "@waifufun/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { constantTimeEqual, createKey, listKeysForAgent, revokeKey } from "../lib/agent-keys.js";
import type { AppBindings } from "../lib/bindings.js";

function requireDrizzle(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function requireAdmin(authHeader: string | undefined): boolean {
	const expected = process.env.ADMIN_API_KEY;
	if (!expected || expected.length === 0) return false;
	if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return false;
	const got = authHeader.slice(7).trim();
	return constantTimeEqual(got, expected);
}

export function createAdminKeysRoutes() {
	const app = new Hono<AppBindings>();

	// Tiny inline guard — admin env var must be set. If missing we reject
	// every request rather than defaulting to open.
	// OK: this guard is mounted exclusively at /admin/agent-keys.
	app.use("*", async (c, next) => {
		if (!requireAdmin(c.req.header("authorization"))) {
			return c.json({ ok: false, error: "UNAUTHORIZED", message: "Admin bearer token required" }, 401);
		}
		await next();
	});

	/**
	 * POST /admin/agent-keys
	 * body: { agentId: string }
	 * returns: { key, prefix, keyId, agentId, scopes } — raw key returned
	 * ONCE, operator must save it.
	 */
	app.post("/", async (c) => {
		let body: { agentId?: string };
		try {
			body = await c.req.json();
		} catch {
			return c.json({ ok: false, error: "INVALID_JSON" }, 400);
		}

		const agentId = body?.agentId?.trim();
		if (!agentId) {
			return c.json({ ok: false, error: "INVALID_REQUEST", message: "agentId required" }, 400);
		}

		const db = requireDrizzle();
		if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);

		// Ensure the agent exists before issuing a key
		const [persona] = await db
			.select({ agentId: agentPersonas.agentId })
			.from(agentPersonas)
			.where(eq(agentPersonas.agentId, agentId))
			.limit(1);

		if (!persona) {
			return c.json(
				{
					ok: false,
					error: "AGENT_NOT_FOUND",
					message: `agent ${agentId} not found in agent_personas`,
				},
				404,
			);
		}

		const { raw, row } = await createKey(db, agentId);

		return c.json({
			ok: true,
			data: {
				keyId: row.id,
				agentId: row.agentId,
				key: raw,
				prefix: row.keyPrefix,
				scopes: row.scopes,
				note: "SAVE THIS KEY NOW. It cannot be retrieved later.",
			},
		});
	});

	/**
	 * GET /admin/agent-keys?agentId=...
	 * Lists all keys (including revoked) for an agent. Never returns raw
	 * keys — only prefix + metadata.
	 */
	app.get("/", async (c) => {
		const agentId = c.req.query("agentId");
		if (!agentId) {
			return c.json({ ok: false, error: "INVALID_REQUEST", message: "agentId query param required" }, 400);
		}

		const db = requireDrizzle();
		if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);

		const rows = await listKeysForAgent(db, agentId);
		return c.json({ ok: true, data: rows });
	});

	/**
	 * DELETE /admin/agent-keys/:keyId
	 * Revokes a key immediately.
	 */
	app.delete("/:keyId", async (c) => {
		const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		const keyId = c.req.param("keyId");
		if (!keyId || !UUID_RE.test(keyId)) {
			return c.json({ ok: false, error: "INVALID_REQUEST", message: "valid keyId (uuid) required" }, 400);
		}

		const db = requireDrizzle();
		if (!db) return c.json({ ok: false, error: "DATABASE_UNAVAILABLE" }, 503);

		await revokeKey(db, keyId);
		return c.json({ ok: true, data: { keyId, revoked: true } });
	});

	return app;
}
