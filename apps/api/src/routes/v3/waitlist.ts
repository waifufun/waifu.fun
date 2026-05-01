import { Hono } from "hono";

import { type Database, getDatabase, launchpadWaitlistQueries } from "@waifufun/db";

import type { AppBindings } from "../../lib/bindings.js";

type V3RouteOptions = { db?: Database };

function requireDb(options?: V3RouteOptions): Database | null {
	if (options?.db) return options.db;
	const url = process.env.DATABASE_URL;
	if (!url) return null;
	return getDatabase(url).db;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createV3WaitlistRoutes(options?: V3RouteOptions) {
	const app = new Hono<AppBindings>();

	app.post("/launchpads/:id/waitlist", async (c) => {
		const db = requireDb(options);
		if (!db) return c.json({ error: "database unavailable" }, 503);

		let body: { email?: unknown };
		try {
			body = (await c.req.json()) as { email?: unknown };
		} catch {
			return c.json({ error: "invalid JSON body" }, 400);
		}

		const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
		if (!EMAIL_RE.test(email)) return c.json({ error: "valid email is required" }, 400);

		const entry = await launchpadWaitlistQueries.addToWaitlist(db, {
			email,
			launchpadId: c.req.param("id"),
		});
		const count = await launchpadWaitlistQueries.getWaitlistCount(db, c.req.param("id"));
		return c.json({ ok: true, waitlist: entry, count }, 201);
	});

	return app;
}

export default createV3WaitlistRoutes();
