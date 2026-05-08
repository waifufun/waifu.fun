import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../../lib/bindings.js";
import { apiErrorHandler } from "../../middleware/error-handler.js";
import { createUserLaunchRoutes } from "./user-launches.js";

function wrapWithErrorHandler(router: ReturnType<typeof createUserLaunchRoutes>): Hono<AppBindings> {
	const app = new Hono<AppBindings>();
	app.route("/", router as never);
	app.onError(apiErrorHandler);
	return app;
}

test("GET /:address/launches rejects malformed address", async () => {
	const router = createUserLaunchRoutes({ db: {} as never });
	const app = wrapWithErrorHandler(router);
	const res = await app.request("/not-an-address/launches");
	assert.equal(res.status, 400);
	const body = (await res.json()) as { error?: { code?: string } };
	assert.equal(body.error?.code, "INVALID_ADDRESS");
});

test("GET /:address/launches returns DB_UNAVAILABLE when no db wired", async () => {
	const router = createUserLaunchRoutes({});
	const app = wrapWithErrorHandler(router);
	const res = await app.request("/0x1111111111111111111111111111111111111111/launches");
	assert.equal(res.status, 400);
	const body = (await res.json()) as { error?: { code?: string } };
	assert.equal(body.error?.code, "DB_UNAVAILABLE");
});
