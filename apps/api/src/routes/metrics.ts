import { Hono } from "hono";

import { metricsRegistry } from "@waifufun/metrics";
import type { AppBindings } from "../lib/bindings.js";

export function createMetricsRoutes() {
	const app = new Hono<AppBindings>();

	app.get("/", async (c) => {
		const apiKey = process.env.METRICS_API_KEY;
		if (apiKey) {
			const authorization = c.req.header("authorization") ?? "";
			if (authorization !== `Bearer ${apiKey}`) {
				return c.text("unauthorized", 401);
			}
		}

		return c.body(await metricsRegistry.metrics(), 200, {
			"content-type": metricsRegistry.contentType,
		});
	});

	return app;
}
