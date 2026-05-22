import { Hono } from "hono";

import { paginationQuerySchema } from "../contracts/common.js";
import { tokenChartQuerySchema, tokenListQuerySchema, tokenTradesQuerySchema } from "../contracts/tokens.js";
import type { AppBindings } from "../lib/bindings.js";
import { notFound, validationFailed } from "../lib/errors.js";
import { respondOk } from "../lib/http.js";
import { parseQuery } from "../lib/validation.js";

export function createTokenRoutes() {
	const app = new Hono<AppBindings>();

	app.get("/", async (c) => {
		const deps = c.get("deps");
		const query = parseQuery(c, tokenListQuerySchema);
		const result = await deps.db.listTokens(query);

		return respondOk(c, result);
	});

	app.get("/:address", async (c) => {
		const deps = c.get("deps");
		const address = c.req.param("address");
		const token = await deps.db.getTokenByAddress(address);

		if (!token) {
			throw notFound("TOKEN_NOT_FOUND", "Token not found", { address });
		}

		return respondOk(c, token);
	});

	app.get("/:address/trades", async (c) => {
		const deps = c.get("deps");
		const pageQuery = parseQuery(c, paginationQuerySchema);
		const result = tokenTradesQuerySchema.safeParse({
			address: c.req.param("address"),
			limit: pageQuery.limit,
		});

		if (!result.success) {
			throw validationFailed(result.error);
		}

		const items = await deps.db.listTokenTrades(result.data);

		return respondOk(c, {
			items,
			total: items.length,
			limit: result.data.limit,
		});
	});

	app.post("/trades", async (c) => {
		const deps = c.get("deps");
		const body = await c.req.json().catch(() => null);
		const result = tokenTradesQuerySchema.safeParse({
			address: body?.contractAddress ?? body?.address,
			limit: body?.limit,
		});

		if (!result.success) {
			throw validationFailed(result.error);
		}

		const items = await deps.db.listTokenTrades(result.data);
		return respondOk(c, {
			docs: items,
			items,
			total: items.length,
			limit: result.data.limit,
		});
	});

	app.get("/:address/chart", async (c) => {
		const deps = c.get("deps");
		const address = c.req.param("address");
		const query = parseQuery(c, tokenChartQuerySchema);

		// Default `from` to 24h before `to` when not provided
		const to = query.to ?? new Date();
		const from = query.from ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);

		const candles = await deps.db.getTokenChartData({
			address,
			interval: query.interval,
			from,
			to,
			limit: query.limit,
		});

		return respondOk(c, {
			candles,
			interval: query.interval,
			tokenAddress: address,
		});
	});

	return app;
}
