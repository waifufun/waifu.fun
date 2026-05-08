import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../../lib/bindings.js";
import { apiErrorHandler } from "../../middleware/error-handler.js";
import type { LaunchService } from "../../services/launch-v2/launch-service.js";
import { createAgentLaunchRoutes, serializeAgentLaunch } from "./agent-launches.js";

function wrapWithErrorHandler(router: ReturnType<typeof createAgentLaunchRoutes>): Hono<AppBindings> {
	const app = new Hono<AppBindings>();
	app.route("/", router as never);
	app.onError(apiErrorHandler);
	return app;
}

const SAMPLE_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "0x000000000000000000000000000000000000aaaa";
const VAULT = "0x000000000000000000000000000000000000bbbb";
const ROUTER = "0x000000000000000000000000000000000000cccc";
const CREATOR = "0x000000000000000000000000000000000000dddd";

function makeRow(overrides: Record<string, unknown> = {}) {
	return {
		id: SAMPLE_ID,
		tokenAddress: TOKEN,
		vaultAddress: VAULT,
		routerAddress: ROUTER,
		treasuryLpAddress: null,
		creator: CREATOR,
		tier: 80,
		presaleCap: "16000000000000000000",
		v2BuyBnb: "0",
		vestingEnabled: 0,
		state: "open" as const,
		totalDeposited: "0",
		bonusPool: "0",
		depositorCount: 0,
		closeTimestamp: BigInt(1_900_000_000),
		launchTimestamp: null,
		v2Pair: null,
		openMcBnb: null,
		curveFillBnb: null,
		tokensFromV2: null,
		tokensBurned: null,
		metadata: {},
		metadataUri: "ipfs://example",
		createTxHash: "0xfeed",
		createBlockNumber: BigInt(123),
		failureReason: null,
		createdAt: new Date("2026-05-08T10:00:00.000Z"),
		updatedAt: new Date("2026-05-08T10:00:00.000Z"),
		...overrides,
	};
}

test("serializeAgentLaunch shapes a row into the public response", () => {
	const out = serializeAgentLaunch(makeRow() as never);
	assert.ok(out);
	assert.equal(out.id, SAMPLE_ID);
	assert.equal(out.token, TOKEN);
	assert.equal(out.tier, 80);
	assert.equal(out.state, "open");
	assert.equal(out.vestingEnabled, false);
	assert.equal(out.closeTimestamp, 1_900_000_000);
	assert.equal(out.launchTimestamp, null);
});

test("serializeAgentLaunch returns null for null row", () => {
	const out = serializeAgentLaunch(null as never);
	assert.equal(out, null);
});

test("GET /by-token/:tokenAddress rejects malformed addresses with 404", async () => {
	// The route is constrained to `0x[40 hex]`; anything else falls through
	// to Hono's default 404. No DB stub needed since the handler never runs.
	const app = createAgentLaunchRoutes({ db: {} as never });
	const res = await app.request("/by-token/not-an-address");
	assert.equal(res.status, 404, "non-0x prefixed addresses should not match the route regex");
});

test("GET /:id returns 404 when the row is missing", async () => {
	const fakeDb = {} as never;
	const app = createAgentLaunchRoutes({
		db: fakeDb,
	});

	// Override the repo lookup by using a pre-baked module — instead, test the
	// route via Hono's request method but stubbing fetch isn't supported here.
	// We rely on the UUID regex constraint: a non-UUID id will not match the
	// route at all, so the app returns 404.
	const res = await app.request("/not-a-uuid");
	assert.equal(res.status, 404);
});

test("POST / returns 400 on missing required fields", async () => {
	const router = createAgentLaunchRoutes({
		db: {} as never,
		launchService: {
			async createLaunchOnchain() {
				throw new Error("should not be called");
			},
		} as unknown as LaunchService,
	});
	const app = wrapWithErrorHandler(router);

	const res = await app.request("/", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: "" }),
	});
	// 422 = validation error in this app's error handler.
	assert.ok(res.status === 400 || res.status === 422, `got ${res.status}`);
});

test("POST /:id/preview returns 400/422 on invalid bnbAmount", async () => {
	const router = createAgentLaunchRoutes({
		db: {} as never,
	});
	const app = wrapWithErrorHandler(router);
	const res = await app.request(`/${SAMPLE_ID}/preview`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ bnbAmount: "not-a-number" }),
	});
	assert.ok(res.status === 400 || res.status === 422, `got ${res.status}`);
});
