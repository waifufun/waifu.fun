import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";
import createLaunchpadRoutes from "./launchpads.js";

interface JsonResponseBody {
	data: any;
}

const readBody = async (res: Response): Promise<JsonResponseBody> => (await res.json()) as JsonResponseBody;

const makeApp = () => {
	const app = new Hono();
	app.route("/v3/launchpads", createLaunchpadRoutes());
	return app;
};

test("GET /v3/launchpads lists live and coming-soon descriptors", async () => {
	const res = await makeApp().request("/v3/launchpads");
	assert.equal(res.status, 200);
	const body = await readBody(res);
	const ids = body.data.map((descriptor: { id: string }) => descriptor.id);
	assert.ok(ids.includes("four-meme-regular"));
	assert.ok(ids.includes("four-meme-tax"));
	assert.ok(ids.includes("flap"));
	assert.ok(ids.includes("pump-fun"));
});

test("GET /v3/launchpads/:id returns descriptor and default config", async () => {
	const res = await makeApp().request("/v3/launchpads/four-meme-tax");
	assert.equal(res.status, 200);
	const body = await readBody(res);
	assert.equal(body.data.descriptor.id, "four-meme-tax");
	assert.equal(body.data.defaultFeeConfig.kind, "four-meme-tax");
});

test("POST /v3/launchpads/:id/validate validates posted feeConfig", async () => {
	// Default platformCutBps = 2500, remaining = 7500. Allocations must each
	// serialize to a whole percent (multiple of 100 bps), so split 7500 into
	// whole-percent buckets: founder 40%, holder 20%, burn 8%, liquidity 7%.
	const res = await makeApp().request("/v3/launchpads/four-meme-tax/validate", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			env: "prod",
			feeConfig: {
				kind: "four-meme-tax",
				taxBps: 300,
				platformCutBps: 2500,
				allocation: { founderBps: 4000, holderBps: 2000, burnBps: 800, liquidityBps: 700 },
				minHolderBalance: "0",
			},
		}),
	});
	assert.equal(res.status, 200);
	const body = await readBody(res);
	assert.deepEqual(body.data, { ok: true, errors: [] });
});
