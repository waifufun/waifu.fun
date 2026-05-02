import { Hono } from "hono";

import { tradeQuoteSchema } from "../contracts/trades.js";
import type { AppBindings } from "../lib/bindings.js";
import { respondOk } from "../lib/http.js";
import { parseJsonBody } from "../lib/validation.js";
import { requireAuth } from "../middleware/auth.js";

export function createTradeRoutes() {
	const app = new Hono<AppBindings>();

	app.post("/quote", async (c) => {
		const deps = c.get("deps");
		const input = await parseJsonBody(c, tradeQuoteSchema);
		const quote = await deps.flap.quoteExactInput(input);

		return respondOk(c, quote);
	});

	app.post("/prepare-swap", requireAuth(), async (c) => {
		const deps = c.get("deps");
		const auth = c.get("auth");
		const input = await parseJsonBody(c, tradeQuoteSchema);

		if (!auth) {
			throw new Error("Auth middleware invariant violated");
		}

		const prepared = await deps.flap.prepareSwap({
			...input,
			traderAddress: auth.address,
		});

		return respondOk(c, prepared);
	});

	return app;
}
