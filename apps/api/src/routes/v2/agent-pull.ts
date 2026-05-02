import {
	type AgentEvent,
	type AgentEventType,
	agentEvents as agentEventsTable,
	getDatabase,
	isAgentEventType,
} from "@waifufun/db";
import { and, asc, count, eq, gt, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

import { type AgentPullAuthBindings, createAgentPullAuth } from "../../middleware/agent-pull-auth.js";
import { emitAgentEvent } from "../../services/events/emit.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const heartbeatBodySchema = z
	.object({
		status: z.enum(["live", "starting", "thinking"]).optional(),
		metadata: z.record(z.unknown()).optional(),
	})
	.strict();

export interface AgentPullRouteDeps {
	auth?: MiddlewareHandler<AgentPullAuthBindings>;
	db?: ReturnType<typeof getDatabase>["db"];
	emitEvent?: typeof emitAgentEvent;
	now?: () => Date;
}

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

async function readOptionalJson(c: Context): Promise<unknown> {
	const text = await c.req.text();
	if (text.trim().length === 0) return {};
	return JSON.parse(text) as unknown;
}

export function createAgentPullRoutes(deps: AgentPullRouteDeps = {}) {
	const app = new Hono<AgentPullAuthBindings>();
	const auth = deps.auth ?? createAgentPullAuth();

	app.post("/:id/heartbeat", auth, async (c) => {
		const agentId = c.req.param("id");
		const persona = c.get("agentPersona");
		if (persona.agentId !== agentId) {
			return c.json(
				{
					ok: false,
					error: "AGENT_ID_MISMATCH",
					message: "Authenticated key is not valid for this agent",
				},
				403,
			);
		}

		let body: z.infer<typeof heartbeatBodySchema>;
		try {
			body = heartbeatBodySchema.parse(await readOptionalJson(c));
		} catch (err) {
			if (err instanceof SyntaxError) {
				return c.json({ ok: false, error: "INVALID_JSON", message: "Request body must be JSON" }, 400);
			}
			return c.json(
				{
					ok: false,
					error: "INVALID_HEARTBEAT_BODY",
					issues: err instanceof z.ZodError ? err.issues : undefined,
				},
				400,
			);
		}

		const db = deps.db ?? requireDb();
		if (!db) {
			return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "Database not configured" }, 503);
		}

		const lastSeenAt = persona.runtimeLastSeenAt ?? deps.now?.() ?? new Date();
		const emit = deps.emitEvent ?? emitAgentEvent;
		await emit({
			agentId,
			tokenAddress: persona.tokenAddress,
			eventType: "agent.heartbeat",
			data: {
				status: body.status ?? "live",
				metadata: body.metadata ?? {},
				lastSeenAt: lastSeenAt.toISOString(),
			},
		});

		const [row] = await db
			.select({ eventsAvailable: count() })
			.from(agentEventsTable)
			.where(and(eq(agentEventsTable.agentId, agentId)));

		return c.json({
			agentId,
			lastSeenAt: lastSeenAt.toISOString(),
			eventsAvailable: Number(row?.eventsAvailable ?? 0),
		});
	});

	app.get("/:id/events/pull", auth, async (c) => {
		const agentId = c.req.param("id");
		const persona = c.get("agentPersona");
		if (persona.agentId !== agentId) {
			return c.json(
				{
					ok: false,
					error: "AGENT_ID_MISMATCH",
					message: "Authenticated key is not valid for this agent",
				},
				403,
			);
		}

		const db = deps.db ?? requireDb();
		if (!db) {
			return c.json({ ok: false, error: "DATABASE_UNAVAILABLE", message: "Database not configured" }, 503);
		}

		const limitRaw = c.req.query("limit");
		let limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
		if (!Number.isFinite(limit) || limit <= 0) limit = 100;
		if (limit > 100) limit = 100;

		const typesRaw = c.req.query("types");
		const types: AgentEventType[] = [];
		if (typesRaw && typesRaw.trim().length > 0) {
			for (const type of typesRaw
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean)) {
				if (!isAgentEventType(type)) {
					return c.json({ ok: false, error: "INVALID_EVENT_TYPE", type }, 400);
				}
				types.push(type);
			}
		}

		const sinceRaw = c.req.query("since");
		let sinceDate: Date | null = null;
		if (sinceRaw && sinceRaw.length > 0) {
			if (UUID_RE.test(sinceRaw)) {
				const [cursorRow] = await db
					.select({ createdAt: agentEventsTable.createdAt })
					.from(agentEventsTable)
					.where(and(eq(agentEventsTable.agentId, agentId), eq(agentEventsTable.id, sinceRaw)))
					.limit(1);
				if (!cursorRow) {
					return c.json({ ok: false, error: "CURSOR_NOT_FOUND", message: "Cursor event not found" }, 400);
				}
				sinceDate = cursorRow.createdAt;
			} else {
				const parsed = new Date(sinceRaw);
				if (Number.isNaN(parsed.getTime())) {
					return c.json(
						{
							ok: false,
							error: "INVALID_CURSOR",
							message: "since must be an ISO timestamp or event UUID",
						},
						400,
					);
				}
				sinceDate = parsed;
			}
		}

		const filters = [eq(agentEventsTable.agentId, agentId)];
		if (sinceDate) filters.push(gt(agentEventsTable.createdAt, sinceDate));
		if (types.length > 0) filters.push(inArray(agentEventsTable.eventType, types));

		const rows = await db
			.select()
			.from(agentEventsTable)
			.where(and(...filters))
			.orderBy(asc(agentEventsTable.createdAt))
			.limit(limit + 1);

		const page = rows.slice(0, limit) as AgentEvent[];
		const nextCursor = rows.length > limit ? (page.at(-1)?.id ?? null) : null;

		return c.json({ events: page, nextCursor });
	});

	return app;
}

export default createAgentPullRoutes();
