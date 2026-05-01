import { Hono } from "hono";

import { createLaunchSchema } from "../contracts/launches.js";
import type { AppBindings } from "../lib/bindings.js";
import { notFound } from "../lib/errors.js";
import { respondAccepted, respondOk } from "../lib/http.js";
import { parseJsonBody } from "../lib/validation.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

export function createLaunchRoutes() {
	const app = new Hono<AppBindings>();

	app.get("/gate", optionalAuth(), async (c) => {
		const deps = c.get("deps");
		const auth = c.get("auth");
		const inviteCode = c.req.query("inviteCode");

		// If curated launch is disabled, everyone gets in
		if (!deps.config.features.curatedLaunchOnly) {
			return respondOk(c, { allowed: true, accessSource: "open" });
		}

		// Check invite code
		if (inviteCode) {
			const result = await deps.db.validateInviteCode(inviteCode);
			if (result.valid) {
				return respondOk(c, {
					allowed: true,
					accessSource: "invite",
					remainingUses: result.remainingUses,
				});
			}
			return respondOk(c, {
				allowed: false,
				reason: result.reason ?? "Invalid or expired invite code",
			});
		}

		// No invite code = denied
		return respondOk(c, {
			allowed: false,
			reason: "An invite code is required to create tokens during the curated launch period.",
		});
	});

	app.post("/", requireAuth(), async (c) => {
		const deps = c.get("deps");
		const auth = c.get("auth");
		const input = await parseJsonBody(c, createLaunchSchema);

		if (!auth) {
			throw new Error("Auth middleware invariant violated");
		}

		const launch = await deps.db.createLaunch(auth.address, input, {
			curatedLaunchOnly: deps.config.features.curatedLaunchOnly,
		});
		const preparation = await deps.flap.prepareLaunchPayload(launch);

		return respondAccepted(c, {
			launch,
			preparation,
		});
	});

	app.get("/:id", requireAuth(), async (c) => {
		const deps = c.get("deps");
		const launch = await deps.db.getLaunchById(c.req.param("id"));

		if (!launch) {
			throw notFound("LAUNCH_NOT_FOUND", "Launch not found");
		}

		const preparation = await deps.flap.prepareLaunchPayload(launch);

		return respondOk(c, {
			launch,
			preparation,
		});
	});

	return app;
}
