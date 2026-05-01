import { type LaunchpadFeeConfig, type LaunchpadId, getAdapter, listAll } from "@waifufun/launchpad";
import { Hono } from "hono";

import type { AppBindings } from "../../lib/bindings.js";
import { respondOk } from "../../lib/http.js";

const isLaunchpadId = (id: string): id is LaunchpadId => Boolean(getAdapter(id as LaunchpadId));

export const createLaunchpadRoutes = () => {
	const app = new Hono<AppBindings>();

	app.get("/", (c) =>
		respondOk(
			c,
			listAll().map((adapter) => adapter.descriptor),
		),
	);

	app.get("/:id", (c) => {
		const id = c.req.param("id");
		if (!isLaunchpadId(id)) return c.json({ ok: false, errors: ["launchpad not found"] }, 404);
		const adapter = getAdapter(id);
		if (!adapter) return c.json({ ok: false, errors: ["launchpad not found"] }, 404);

		let defaultFeeConfig: LaunchpadFeeConfig | null = null;
		if (adapter.descriptor.status === "live") {
			defaultFeeConfig = adapter.getDefaultFeeConfig();
		}

		return respondOk(c, { descriptor: adapter.descriptor, defaultFeeConfig });
	});

	app.post("/:id/validate", async (c) => {
		const id = c.req.param("id");
		if (!isLaunchpadId(id)) return c.json({ ok: false, errors: ["launchpad not found"] }, 404);
		const adapter = getAdapter(id);
		if (!adapter) return c.json({ ok: false, errors: ["launchpad not found"] }, 404);

		const body = (await c.req.json().catch(() => ({}))) as {
			feeConfig?: LaunchpadFeeConfig;
			env?: "prod" | "dev";
		};
		if (!body.feeConfig) {
			return respondOk(c, { ok: false, errors: ["feeConfig is required"] });
		}

		const result = adapter.validateFeeConfig(body.feeConfig, body.env ?? "prod");
		return respondOk(c, result);
	});

	return app;
};

export default createLaunchpadRoutes;
