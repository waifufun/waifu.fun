import { Hono } from "hono";

import { updateCreatorSchema } from "../contracts/creators.js";
import { sameAddress } from "../lib/address.js";
import type { AppBindings } from "../lib/bindings.js";
import { forbidden } from "../lib/errors.js";
import { respondOk } from "../lib/http.js";
import { parseJsonBody } from "../lib/validation.js";
import { requireAuth } from "../middleware/auth.js";

export function createCreatorRoutes() {
	const app = new Hono<AppBindings>();

	app.get("/:address", async (c) => {
		const deps = c.get("deps");
		const address = c.req.param("address");
		const profile = await deps.db.getCreatorProfile(address);

		return respondOk(c, profile);
	});

	app.put("/:address", requireAuth(), async (c) => {
		const deps = c.get("deps");
		const auth = c.get("auth");
		const address = c.req.param("address");

		if (!auth) {
			throw new Error("Auth middleware invariant violated");
		}

		if (!sameAddress(auth.address, address) && auth.role !== "admin" && auth.role !== "superadmin") {
			throw forbidden("Cannot update another creator profile");
		}

		const input = await parseJsonBody(c, updateCreatorSchema);
		const profile = await deps.db.updateCreatorProfile(address, input);

		return respondOk(c, profile);
	});

	return app;
}
