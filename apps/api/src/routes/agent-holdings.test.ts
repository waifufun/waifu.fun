import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "@waifufun/db";
import app, { __setAgentHoldingsRoutesDepsForTest } from "./v2/agent-holdings.js";

const DB = {} as Database;
const AGENT = "0x15fc00000000000000000000000000000000abcd";

test.afterEach(() => __setAgentHoldingsRoutesDepsForTest({}));

test("agent holdings route returns snapshot and X-Sources-Stale", async () => {
	__setAgentHoldingsRoutesDepsForTest({
		db: DB,
		getAgentTokenAddress: async () => AGENT,
		listWallets: async () => [
			{
				id: "w1",
				address: "0x0000000000000000000000000000000000000001",
				chain: "bsc",
				role: "agent-safe",
				label: "safe",
			},
		],
		enumerateNative: async () => ({ holdings: [], stale: [{ source: "bsc:evm-native", reason: "timeout" }] }),
		enumerateErc20: async () => ({ holdings: [], stale: [] }),
	});
	const res = await app.request(`/${AGENT}/holdings`);
	assert.equal(res.status, 200);
	assert.equal(res.headers.get("cache-control"), "public, max-age=30, stale-while-revalidate=60");
	assert.equal(res.headers.get("x-sources-stale"), "bsc:evm-native");
});
