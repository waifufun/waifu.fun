import assert from "node:assert/strict";
import test from "node:test";

import { type LaunchpadAdapter, clearAdaptersForTest, listAll, listLive, registerAdapter } from "../src/index.js";

const makeAdapter = (id: "pump-fun" | "bags", status: "live" | "coming-soon") =>
	({
		descriptor: {
			id,
			status,
			chain: "solana",
			displayName: id,
			shortDescription: id,
			feeSummary: id,
			graduationTarget: id,
		},
	}) as LaunchpadAdapter;

test("registry registers, replaces, lists all, and filters live adapters", () => {
	clearAdaptersForTest();
	registerAdapter(makeAdapter("pump-fun", "coming-soon"));
	registerAdapter(makeAdapter("bags", "live"));

	assert.equal(listAll().length, 2);
	assert.deepEqual(
		listLive().map((adapter) => adapter.descriptor.id),
		["bags"],
	);

	registerAdapter(makeAdapter("bags", "coming-soon"));
	assert.equal(listAll().length, 2);
	assert.equal(listLive().length, 0);
});
