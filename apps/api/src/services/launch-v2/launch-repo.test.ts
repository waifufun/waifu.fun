import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db/client";

import { insertLaunch } from "./launch-repo.js";

test("insertLaunch persists per-launch tax bps", async () => {
	let inserted: Record<string, unknown> = {};
	const db = {
		insert: () => ({
			values(values: Record<string, unknown>) {
				inserted = values;
				return {
					returning: async () => [{ id: "00000000-0000-0000-0000-000000000001", ...values }],
				};
			},
		}),
	} as unknown as Database;

	const row = await insertLaunch(db, {
		tokenAddress: "0x0000000000000000000000000000000000000002",
		vaultAddress: "0x0000000000000000000000000000000000000003",
		routerAddress: "0x0000000000000000000000000000000000000004",
		creator: "0x0000000000000000000000000000000000000005",
		taxSplitterAddress: "0x00000000000000000000000000000000000000AA",
		agentSafeAddress: "0x00000000000000000000000000000000000000BB",
		platformBps: 1000,
		patronBps: 2500,
		agentSafeOwners: ["0x00000000000000000000000000000000000000CC"],
		agentSafeThreshold: 1,
		tier: 80,
		presaleCap: "16000000000000000000",
		v2BuyBnb: "0",
		vestingEnabled: false,
		buyTaxBps: 500,
		sellTaxBps: 700,
		closeTimestamp: 1n,
	});

	assert.equal(inserted?.buyTaxBps, 500);
	assert.equal(inserted?.sellTaxBps, 700);
	assert.equal(inserted?.taxSplitterAddress, "0x00000000000000000000000000000000000000aa");
	assert.equal(inserted?.agentSafeAddress, "0x00000000000000000000000000000000000000bb");
	assert.equal(inserted?.platformBps, 1000);
	assert.equal(inserted?.patronBps, 2500);
	assert.deepEqual(inserted?.agentSafeOwners, ["0x00000000000000000000000000000000000000cc"]);
	assert.equal(inserted?.agentSafeThreshold, 1);
	assert.equal(row.buyTaxBps, 500);
	assert.equal(row.sellTaxBps, 700);
});
