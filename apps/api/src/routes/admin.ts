import { Hono } from "hono";

import { createInviteSchema } from "../contracts/invites.js";
import type { AppBindings } from "../lib/bindings.js";
import { notFound } from "../lib/errors.js";
import { respondAccepted, respondOk } from "../lib/http.js";
import { parseJsonBody } from "../lib/validation.js";
import { requireRole } from "../middleware/auth.js";

export function createAdminRoutes() {
	const app = new Hono<AppBindings>();

	// OK: mounted exclusively at /admin. More-specific admin routes must mount before it.
	app.use("*", requireRole("admin"));

	app.get("/launches", async (c) => {
		const deps = c.get("deps");
		const launches = await deps.db.listAdminLaunches();

		return respondOk(c, {
			items: launches,
			total: launches.length,
		});
	});

	app.post("/launches/:id/approve", async (c) => {
		const deps = c.get("deps");
		const launch = await deps.db.updateLaunchStatus(c.req.param("id"), "approved");

		if (!launch) {
			throw notFound("LAUNCH_NOT_FOUND", "Launch not found");
		}

		const preparation = await deps.flap.prepareLaunchPayload(launch);

		return respondOk(c, {
			launch,
			preparation,
		});
	});

	app.post("/launches/:id/reject", async (c) => {
		const deps = c.get("deps");
		const launch = await deps.db.updateLaunchStatus(c.req.param("id"), "rejected");

		if (!launch) {
			throw notFound("LAUNCH_NOT_FOUND", "Launch not found");
		}

		return respondOk(c, launch);
	});

	// --- Invite code management ---

	app.post("/invites", async (c) => {
		const deps = c.get("deps");
		const auth = c.get("auth");
		const input = await parseJsonBody(c, createInviteSchema);

		if (!auth) {
			throw new Error("Auth middleware invariant violated");
		}

		const invite = await deps.db.createInviteCode({
			code: input.code,
			maxUses: input.maxUses,
			createdByAddress: auth.address,
			expiresAt: input.expiresAt,
		});

		return respondOk(c, invite);
	});

	app.get("/invites", async (c) => {
		const deps = c.get("deps");
		const invites = await deps.db.listInviteCodes();

		return respondOk(c, {
			items: invites,
			total: invites.length,
		});
	});

	// --- Reindex ---

	app.post("/reindex", async (c) => {
		const deps = c.get("deps");

		return respondAccepted(c, {
			accepted: true,
			mode: deps.runtime.compatibilityMode,
			notes: [
				"Reindex remains an API contract only in apps/api.",
				"Wire this route to packages/queue once the shared queue package exists.",
			],
		});
	});

	return app;
}
