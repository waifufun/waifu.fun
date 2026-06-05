import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { agentEvents, renderEventData, tradeRationales } from "@waifufun/db";
import { getDatabase } from "@waifufun/db/client";

import { constantTimeEqual } from "../../../lib/agent-keys.js";

const app = new Hono();

const rationaleSchema = z.object({
	agentId: z.string().trim().min(1).max(128),
	coin: z.string().trim().min(1).max(32),
	side: z.enum(["long", "short"]).optional(),
	action: z.enum(["open", "close"]).optional(),
	reason: z.string().trim().min(1).max(2_000),
});

const backfillSchema = rationaleSchema.extend({
	lookbackMinutes: z
		.number()
		.int()
		.positive()
		.max(24 * 60)
		.optional(),
});

app.use("*", async (c, next) => {
	const authHeader = c.req.header("authorization");
	if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
		return c.json({ ok: false, error: "UNAUTHORIZED", message: "Admin bearer token required" }, 401);
	}
	const expected = process.env.ADMIN_API_KEY;
	const got = authHeader.slice(7).trim();
	if (!expected || expected.length === 0 || !constantTimeEqual(got, expected)) {
		return c.json({ ok: false, error: "FORBIDDEN", message: "Invalid admin bearer token" }, 403);
	}
	await next();
});

function normalizeCoin(coin: string): string {
	return coin.trim().toUpperCase();
}

app.post("/", async (c) => {
	const parsed = rationaleSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ ok: false, error: "BAD_REQUEST", issues: parsed.error.flatten() }, 400);
	}

	const db = getDatabase().db;
	const [row] = await db
		.insert(tradeRationales)
		.values({
			agentId: parsed.data.agentId,
			coin: normalizeCoin(parsed.data.coin),
			side: parsed.data.side ?? null,
			action: parsed.data.action ?? null,
			reason: parsed.data.reason,
		})
		.returning({ id: tradeRationales.id });

	return c.json({ ok: true, data: { id: row?.id } });
});

app.post("/backfill", async (c) => {
	const parsed = backfillSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return c.json({ ok: false, error: "BAD_REQUEST", issues: parsed.error.flatten() }, 400);
	}

	const db = getDatabase().db;
	const coin = normalizeCoin(parsed.data.coin);
	const lookbackMinutes = parsed.data.lookbackMinutes ?? 30;
	const since = new Date(Date.now() - lookbackMinutes * 60_000);
	const eventTypes =
		parsed.data.action === "close"
			? ["trade.close" as const]
			: parsed.data.action === "open"
				? ["trade.open" as const]
				: ["trade.open" as const, "trade.close" as const];
	const sideFilter = parsed.data.side ? sql`${agentEvents.data}->>'side' = ${parsed.data.side}` : undefined;

	const [event] = await db
		.select({ id: agentEvents.id, eventType: agentEvents.eventType, data: agentEvents.data })
		.from(agentEvents)
		.where(
			and(
				eq(agentEvents.agentId, parsed.data.agentId),
				inArray(agentEvents.eventType, eventTypes),
				sql`upper(coalesce(${agentEvents.data}->>'coin', ${agentEvents.data}->>'asset')) = ${coin}`,
				sql`${agentEvents.createdAt} >= ${since}`,
				sideFilter,
			),
		)
		.orderBy(desc(agentEvents.createdAt))
		.limit(1);

	if (!event) {
		return c.json({ ok: false, error: "NOT_FOUND", message: "No recent trade event found" }, 404);
	}

	const eventData = event.data as Record<string, unknown>;
	const dataWithReason = { ...eventData, reason: parsed.data.reason };
	await db
		.update(agentEvents)
		.set({ data: renderEventData(event.eventType, dataWithReason) })
		.where(eq(agentEvents.id, event.id));

	const [rationale] = await db
		.insert(tradeRationales)
		.values({
			agentId: parsed.data.agentId,
			coin,
			side: parsed.data.side ?? null,
			action: parsed.data.action ?? null,
			reason: parsed.data.reason,
			consumedAt: new Date(),
		})
		.returning({ id: tradeRationales.id });

	return c.json({ ok: true, data: { eventId: event.id, rationaleId: rationale?.id } });
});

export default app;
