import { Hono } from "hono";

import { getDatabase } from "@waifufun/db";

import { resolveTwitterHandleForAddress } from "../../services/twitter/resolve-handle.js";
import { fetchRecentTweets } from "../../services/twitter/tweets.js";

const app = new Hono();
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

function requireDb(): ReturnType<typeof getDatabase>["db"] | null {
	const url = process.env.DATABASE_URL;
	if (!url || url.length === 0) return null;
	return getDatabase(url).db;
}

function parseLimit(raw: string | undefined): number {
	if (!raw) return DEFAULT_LIMIT;
	const n = Number.parseInt(raw, 10);
	if (!Number.isFinite(n)) return DEFAULT_LIMIT;
	return Math.min(Math.max(n, 1), MAX_LIMIT);
}

app.get("/:address/tweets", async (c) => {
	const db = requireDb();
	if (!db) return c.json({ ok: false, error: "database unavailable" }, 503);

	const address = c.req.param("address");
	if (!ADDRESS_RE.test(address)) return c.json({ ok: false, error: "invalid agent address" }, 400);

	const limit = parseLimit(c.req.query("limit"));

	try {
		const handle = await resolveTwitterHandleForAddress(db, address);
		c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
		if (!handle) {
			return c.json(
				{
					ok: true,
					data: { handle: null, tweets: [], source: "fallback" as const },
				},
				200,
			);
		}
		const result = await fetchRecentTweets(handle, limit);
		return c.json({ ok: true, data: result }, 200);
	} catch (err) {
		return c.json(
			{
				ok: false,
				error: "failed to load tweets",
				detail: err instanceof Error ? err.message : String(err),
			},
			500,
		);
	}
});

export default app;
