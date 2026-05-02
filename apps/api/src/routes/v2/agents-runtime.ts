import { Hono } from "hono";

import { getDatabase } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";

import { requireAgentOwnership, requirePatron } from "../../middleware/patron-auth.js";
import { getAgentRuntimeState } from "../../services/provisioning.js";

export type AgentRuntimeState = {
	state: "pending" | "provisioning" | "live" | "failed" | "dormant";
	containerId?: string;
	containerUrl?: string;
	lastEventAt?: string;
	lastError?: string;
};

export function createAgentRuntimeRoutes(
	options: {
		db?: Database;
		getRuntimeState?: (db: Database, agentId: string) => Promise<AgentRuntimeState | null>;
	} = {},
) {
	const app = new Hono();

	app.get("/:id/runtime", requirePatron(), requireAgentOwnership("id"), async (c) => {
		const agentId = c.req.param("id");
		if (!agentId || agentId.length > 128) {
			return c.json({ error: "invalid agent id" }, 400);
		}

		const db = options.db ?? requireDb();
		if (!db) return c.json({ error: "database unavailable" }, 503);

		try {
			const state = await (options.getRuntimeState ?? getAgentRuntimeState)(db, agentId);
			if (!state) return c.json({ error: "agent not found" }, 404);
			return c.json(state);
		} catch (err) {
			return c.json(
				{
					error: "failed to load runtime state",
					detail: err instanceof Error ? err.message : String(err),
				},
				500,
			);
		}
	});

	app.put("/:id/runtime", requirePatron(), requireAgentOwnership("id"), async (c) => {
		return c.json(
			{
				ok: false,
				error: "NOT_IMPLEMENTED",
				message: "runtime config updates are not implemented yet",
			},
			501,
		);
	});

	app.post("/:id/runtime/test", requirePatron(), requireAgentOwnership("id"), async (c) => {
		return c.json({ ok: false, error: "NOT_IMPLEMENTED", message: "runtime test is not implemented yet" }, 501);
	});

	app.post("/:id/runtime/rotate-key", requirePatron(), requireAgentOwnership("id"), async (c) => {
		return c.json(
			{
				ok: false,
				error: "NOT_IMPLEMENTED",
				message: "runtime key rotation is not implemented yet",
			},
			501,
		);
	});

	return app;
}

function requireDb(): Database | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

export default createAgentRuntimeRoutes();
