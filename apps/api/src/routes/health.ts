import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import { respondOk } from "../lib/http.js";

export function createHealthRoutes() {
	const app = new Hono<AppBindings>();

	app.get("/", async (c) => {
		const deps = c.get("deps");
		const [db, flap] = await Promise.all([deps.db.health(), deps.flap.health()]);

		const uptimeSeconds = Math.floor((Date.now() - new Date(deps.runtime.startedAt).getTime()) / 1000);

		return respondOk(c, {
			service: deps.config.app.name,
			env: deps.config.app.env,
			uptimeSeconds,
			compatibilityMode: deps.runtime.compatibilityMode,
			dependencies: {
				db,
				flap,
			},
			notes: deps.runtime.notes,
		});
	});

	app.get("/live", (c) => respondOk(c, { status: "live" }));

	app.get("/ready", async (c) => {
		const deps = c.get("deps");
		const ready = (await deps.db.ping()) && (await deps.flap.ping());

		return respondOk(
			c,
			{
				status: ready ? "ready" : "degraded",
			},
			ready ? 200 : 503,
		);
	});

	return app;
}
