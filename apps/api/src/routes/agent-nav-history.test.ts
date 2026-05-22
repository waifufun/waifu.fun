import assert from "node:assert/strict";
import test from "node:test";

import app, { __setAgentNavHistoryRoutesDepsForTest } from "./v2/agent-nav-history.js";

const AGENT = "0x1111111111111111111111111111111111111111";
type NavHistoryResponse = { ok: boolean; data: { points: Array<{ t: string; nav: number }> } };

test.afterEach(() => {
	__setAgentNavHistoryRoutesDepsForTest({});
});

test("agent nav-history returns hourly points for the requested 24h window", async () => {
	const now = new Date("2026-05-22T13:00:00.000Z");
	const rows = Array.from({ length: 25 }, (_, index) => ({
		snapshotAt: new Date(now.getTime() - (24 - index) * 60 * 60 * 1000),
		navUsd: String(100 + index),
	}));
	__setAgentNavHistoryRoutesDepsForTest({
		now: () => now,
		listRows: async (_address, cutoff) => rows.filter((row) => !cutoff || row.snapshotAt >= cutoff),
	});

	const res = await app.request(`/${AGENT}/nav-history?window=24h&interval=1h`);
	assert.equal(res.status, 200);
	assert.equal(res.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=600");
	const body = (await res.json()) as NavHistoryResponse;
	assert.equal(body.ok, true);
	assert.equal(body.data.points.length, 25);
	assert.deepEqual(body.data.points[0], { t: "2026-05-21T13:00:00.000Z", nav: 100 });
	assert.deepEqual(body.data.points.at(-1), { t: "2026-05-22T13:00:00.000Z", nav: 124 });
});

test("agent nav-history returns last-of-day points for daily interval", async () => {
	__setAgentNavHistoryRoutesDepsForTest({
		now: () => new Date("2026-05-22T23:00:00.000Z"),
		listRows: async () => [
			{ snapshotAt: new Date("2026-05-21T01:00:00.000Z"), navUsd: "10" },
			{ snapshotAt: new Date("2026-05-21T23:00:00.000Z"), navUsd: "20" },
			{ snapshotAt: new Date("2026-05-22T02:00:00.000Z"), navUsd: "30" },
		],
	});

	const res = await app.request(`/${AGENT}/nav-history?window=7d&interval=1d`);
	assert.equal(res.status, 200);
	const body = (await res.json()) as NavHistoryResponse;
	assert.deepEqual(body.data.points, [
		{ t: "2026-05-21T23:00:00.000Z", nav: 20 },
		{ t: "2026-05-22T02:00:00.000Z", nav: 30 },
	]);
});

test("agent nav-history returns honest empty for an agent with no snapshots", async () => {
	__setAgentNavHistoryRoutesDepsForTest({ listRows: async () => [] });

	const res = await app.request(`/${AGENT}/nav-history`);
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { ok: true, data: { points: [] } });
});
