import { and, count, desc, eq, inArray, lt, or } from "drizzle-orm";
import { Hono } from "hono";

import {
	type AgentEvent,
	type AgentEventType,
	agentEvents as agentEventsTable,
	agentPersonas,
	getDatabase,
	isAgentEventType,
	renderEventData,
} from "@waifufun/db";

import { groupGithubAgentEvents } from "./agent-event-groups.js";

const app = new Hono();

// The activity feed polls these endpoints every 15s. They must never be served
// from the browser HTTP cache or a CDN edge in front of api.waifu.fun, or the
// feed re-renders with identical (stale) data and looks frozen. Mirrors the
// frontend hook which fetches with `cache: "no-store"`.
const FEED_CACHE_CONTROL = "no-store";

/**
 * Event types that are pure on-chain / source-of-truth activity records and
 * are ALSO enqueued (`status: "pending"`) for the brain worker to optionally
 * turn into a tweet. Their feed visibility must NOT depend on the brain worker
 * having processed them: a buy/sell/launch/bond happened on-chain regardless of
 * whether a tweet was generated, rate-limited (`skipped`) or had no persona
 * (`failed`). We surface these in the feed at ANY status. Queue-only / operator
 * event types (provisioning, system.*, reindex, etc.) stay gated on
 * `status IN ('done','completed')` so genuinely-unprocessed work is not leaked.
 *
 * Canonical names (post `canonicalAgentEventType`) AND the legacy brain-bus
 * aliases the indexers still write are both listed so the filter matches the
 * row's stored `event_type` either way.
 */
const DISPLAY_ONLY_EVENT_TYPES: AgentEventType[] = [
	"token.created",
	"token.purchased",
	"token.sold",
	"agent.bonded",
	"agent.graduated",
	"launch.confirmed",
	// legacy brain-bus aliases written by the evm-indexer / launch-indexer
	"agent.created",
	"agent.trade.buy",
	"agent.trade.sell",
];

/**
 * Build the status/visibility filter for the public feed.
 *
 * A row is feed-visible when it is public AND either:
 *   - terminal-success (`done`/`completed`), OR
 *   - a display-only on-chain event type (any status), so the feed stays live
 *     even if the brain worker lags, dies, rate-limits, or fails persona lookup.
 */
function feedVisibilityFilter() {
	return and(
		eq(agentEventsTable.visibility, "public"),
		or(
			inArray(agentEventsTable.status, ["done", "completed"]),
			inArray(agentEventsTable.eventType, DISPLAY_ONLY_EVENT_TYPES),
		),
	);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

async function resolveEventAgentIdentity(
	db: NonNullable<ReturnType<typeof requireDb>>,
	routeAgentId: string,
): Promise<{ agentIds: string[]; tokenAddresses: string[] }> {
	const ids = new Set<string>([routeAgentId]);
	const tokenAddresses = new Set<string>();
	const lookup = routeAgentId.trim();
	if (!lookup) return { agentIds: [...ids], tokenAddresses: [] };

	if (UUID_RE.test(lookup)) {
		const [byUuid] = await db
			.select({ id: agentPersonas.id, agentId: agentPersonas.agentId, tokenAddress: agentPersonas.tokenAddress })
			.from(agentPersonas)
			.where(eq(agentPersonas.id, lookup))
			.limit(1);
		if (byUuid) {
			ids.add(byUuid.id);
			ids.add(byUuid.agentId);
			if (byUuid.tokenAddress) tokenAddresses.add(byUuid.tokenAddress.toLowerCase());
		}
	}

	const tokenCandidates: string[] = lookup.startsWith("0x")
		? Array.from(new Set([lookup, lookup.toLowerCase()]))
		: [lookup];
	if (lookup.startsWith("0x")) tokenAddresses.add(lookup.toLowerCase());
	const tokenMatchers = tokenCandidates.map((value) => eq(agentPersonas.tokenAddress, value));
	const publicIdFilter = or(eq(agentPersonas.agentId, lookup), ...tokenMatchers);
	const [byPublicId] = publicIdFilter
		? await db
				.select({ id: agentPersonas.id, agentId: agentPersonas.agentId, tokenAddress: agentPersonas.tokenAddress })
				.from(agentPersonas)
				.where(publicIdFilter)
				.limit(1)
		: [];
	if (byPublicId) {
		ids.add(byPublicId.id);
		ids.add(byPublicId.agentId);
		if (byPublicId.tokenAddress) tokenAddresses.add(byPublicId.tokenAddress.toLowerCase());
	}

	return { agentIds: [...ids], tokenAddresses: [...tokenAddresses] };
}

/**
 * GET /v2/agents/:agentId/events/stats
 *
 * Counts grouped by canonical event type.
 */
app.get("/:agentId/events/stats", async (c) => {
	c.header("Cache-Control", FEED_CACHE_CONTROL);
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	const agentId = c.req.param("agentId");
	const identity = await resolveEventAgentIdentity(db, agentId);
	const eventAgentIds = identity.agentIds;
	const tokenAddresses = identity.tokenAddresses;
	const source = c.req.query("source");
	const filters = [
		tokenAddresses.length > 0
			? or(
					eventAgentIds.length === 1
						? eq(agentEventsTable.agentId, eventAgentIds[0] as string)
						: inArray(agentEventsTable.agentId, eventAgentIds),
					inArray(agentEventsTable.tokenAddress, tokenAddresses),
				)
			: eventAgentIds.length === 1
				? eq(agentEventsTable.agentId, eventAgentIds[0] as string)
				: inArray(agentEventsTable.agentId, eventAgentIds),
		feedVisibilityFilter(),
	];
	if (source) filters.push(eq(agentEventsTable.source, source));

	try {
		const rows = await db
			.select({ eventType: agentEventsTable.eventType, count: count() })
			.from(agentEventsTable)
			.where(and(...filters))
			.groupBy(agentEventsTable.eventType);
		return c.json({ stats: rows });
	} catch (err) {
		return c.json(
			{ error: "failed to load event stats", detail: err instanceof Error ? err.message : String(err) },
			500,
		);
	}
});

/**
 * GET /v2/agents/:agentId/events
 *
 * Public chronological activity feed, newest first.
 */
app.get("/:agentId/events", async (c) => {
	c.header("Cache-Control", FEED_CACHE_CONTROL);
	const db = requireDb();
	if (!db) return c.json({ error: "database unavailable" }, 503);

	const agentId = c.req.param("agentId");
	const identity = await resolveEventAgentIdentity(db, agentId);
	const eventAgentIds = identity.agentIds;
	const tokenAddresses = identity.tokenAddresses;

	const limitRaw = c.req.query("limit");
	let limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;
	if (!Number.isFinite(limit) || limit <= 0) limit = 25;
	if (limit > 200) limit = 200;

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

	const source = c.req.query("source");
	const cursorRaw = c.req.query("cursor");
	let cursorDate: Date | null = null;
	if (cursorRaw && cursorRaw.length > 0) {
		if (UUID_RE.test(cursorRaw)) {
			const [cursorRow] = await db
				.select({ createdAt: agentEventsTable.createdAt })
				.from(agentEventsTable)
				.where(
					and(
						eventAgentIds.length === 1
							? eq(agentEventsTable.agentId, eventAgentIds[0] as string)
							: inArray(agentEventsTable.agentId, eventAgentIds),
						eq(agentEventsTable.id, cursorRaw),
					),
				)
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

	const filters = [
		tokenAddresses.length > 0
			? or(
					eventAgentIds.length === 1
						? eq(agentEventsTable.agentId, eventAgentIds[0] as string)
						: inArray(agentEventsTable.agentId, eventAgentIds),
					inArray(agentEventsTable.tokenAddress, tokenAddresses),
				)
			: eventAgentIds.length === 1
				? eq(agentEventsTable.agentId, eventAgentIds[0] as string)
				: inArray(agentEventsTable.agentId, eventAgentIds),
		feedVisibilityFilter(),
	];
	if (cursorDate) filters.push(lt(agentEventsTable.createdAt, cursorDate));
	if (types.length > 0) filters.push(inArray(agentEventsTable.eventType, types));
	if (source) filters.push(eq(agentEventsTable.source, source));

	try {
		const rows = await db
			.select()
			.from(agentEventsTable)
			.where(and(...filters))
			.orderBy(desc(agentEventsTable.createdAt))
			.limit(limit + 1);

		const page = (rows.slice(0, limit) as AgentEvent[]).map((row) => ({
			...row,
			data: row.data?.renderedText ? row.data : renderEventData(row.eventType, row.data ?? {}),
		}));
		const events = groupGithubAgentEvents(page);
		const nextCursor = rows.length > limit ? (page.at(-1)?.createdAt.toISOString() ?? null) : null;

		return c.json({ events, nextCursor });
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
