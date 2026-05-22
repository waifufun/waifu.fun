import { and, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { Hono } from "hono";

import {
	type AgentEvent,
	type AgentEventType,
	agentEvents as agentEventsTable,
	getDatabase,
	isAgentEventType,
} from "@waifufun/db";

const app = new Hono();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

/**
 * GET /v2/agents/:agentId/events
 *
 * Public chronological activity feed, newest first.
 */
app.get("/:agentId/events", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	const agentId = c.req.param("agentId");

	const limitRaw = c.req.query("limit");
	let limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;
	if (!Number.isFinite(limit) || limit <= 0) limit = 25;
	if (limit > 100) limit = 100;

	const typesRaw = c.req.query("types");
	const types: AgentEventType[] = [];
	if (typesRaw && typesRaw.trim().length > 0) {
		for (const type of typesRaw
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean)) {
			if (!isAgentEventType(type)) {
				return c.json({ error: "invalid event type filter", type }, 400);
			}
			types.push(type);
		}
	}

	const cursorRaw = c.req.query("cursor");
	let cursorDate: Date | null = null;
	if (cursorRaw && cursorRaw.length > 0) {
		if (UUID_RE.test(cursorRaw)) {
			const [cursorRow] = await db
				.select({ createdAt: agentEventsTable.createdAt })
				.from(agentEventsTable)
				.where(and(eq(agentEventsTable.agentId, agentId), eq(agentEventsTable.id, cursorRaw)))
				.limit(1);
			if (!cursorRow) {
				return c.json({ error: "cursor not found" }, 400);
			}
			cursorDate = cursorRow.createdAt;
		} else {
			const parsed = new Date(cursorRaw);
			if (Number.isNaN(parsed.getTime())) {
				return c.json({ error: "cursor must be an ISO timestamp or UUID" }, 400);
			}
			cursorDate = parsed;
		}
	}

	const filters = [eq(agentEventsTable.agentId, agentId), ne(agentEventsTable.status, "skipped")];
	if (cursorDate) filters.push(lt(agentEventsTable.createdAt, cursorDate));
	if (types.length > 0) filters.push(inArray(agentEventsTable.eventType, types));

	try {
		const rows = await db
			.select()
			.from(agentEventsTable)
			.where(and(...filters))
			.orderBy(desc(agentEventsTable.createdAt))
			.limit(limit + 1);

		const page = rows.slice(0, limit) as AgentEvent[];
		const nextCursor = rows.length > limit ? (page.at(-1)?.createdAt.toISOString() ?? null) : null;

		return c.json({ events: page, nextCursor });
	} catch (err) {
		return c.json(
			{
				error: "failed to list agent events",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

export default app;
