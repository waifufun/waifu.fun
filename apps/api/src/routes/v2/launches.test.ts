import assert from "node:assert/strict";
import test from "node:test";

import { createLaunchV2Routes, serializePublicLaunch } from "./launches.js";

test("serializePublicLaunch returns the public lifecycle shape", () => {
	const authorizedAt = new Date("2026-04-24T20:00:00.000Z");

	assert.deepEqual(
		serializePublicLaunch({
			id: "launch-1",
			agentId: "waifu-demo",
			status: "provisioned",
			creatorAddress: "0xsafe",
			tokenAddress: null,
			taxRecipientAddress: null,
			taxSplitterAddress: "0xsplitter",
			agentSafeAddress: "0xsafe2",
			platformBps: 1000,
			patronBps: 2500,
			agentSafeOwners: ["0xowner"],
			agentSafeThreshold: 1,
			taxSplit: { splitterAddress: "0xsplitter" },
			firstBuyWei: "100000000000000000",
			launchAuthorizedAt: authorizedAt,
			launchAuthorizedBy: "0xpatron",
			failureReason: null,
		}),
		{
			launchId: "launch-1",
			agentId: "waifu-demo",
			status: "provisioned",
			creatorAddress: "0xsafe",
			tokenAddress: null,
			taxRecipient: "0xsplitter",
			taxSplitter: "0xsplitter",
			agentSafe: "0xsafe2",
			taxSplit: { platformBps: 1000, patronBps: 2500, agentBps: 6500 },
			agentSafeConfig: { owners: ["0xowner"], threshold: 1 },
			firstBuyWei: "100000000000000000",
			launchAuthorizedAt: "2026-04-24T20:00:00.000Z",
			launchAuthorizedBy: "0xpatron",
			errorMessage: null,
		},
	);
});

test("GET /:id returns launch details", async () => {
	const app = createLaunchV2Routes({
		db: {} as never,
		async getLaunch(_db, id) {
			assert.equal(id, "launch-1");
			return {
				launchId: "launch-1",
				agentId: "waifu-demo",
				status: "queued",
				creatorAddress: "0xsafe",
				tokenAddress: null,
				taxRecipient: "0xsplitter",
				taxSplitter: "0xsplitter",
				agentSafe: null,
				taxSplit: null,
				agentSafeConfig: null,
				firstBuyWei: "0",
				launchAuthorizedAt: null,
				launchAuthorizedBy: "0xpatron",
				errorMessage: null,
			};
		},
	});

	const res = await app.request("/launch-1");
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), {
		launchId: "launch-1",
		agentId: "waifu-demo",
		status: "queued",
		creatorAddress: "0xsafe",
		tokenAddress: null,
		taxRecipient: "0xsplitter",
		taxSplitter: "0xsplitter",
		agentSafe: null,
		taxSplit: null,
		agentSafeConfig: null,
		firstBuyWei: "0",
		launchAuthorizedAt: null,
		launchAuthorizedBy: "0xpatron",
		errorMessage: null,
	});
});

test("GET /:id returns 404 when launch is missing", async () => {
	const app = createLaunchV2Routes({
		db: {} as never,
		async getLaunch() {
			return null;
		},
	});

	const res = await app.request("/missing");
	assert.equal(res.status, 404);
	assert.deepEqual(await res.json(), { error: "launch not found" });
});
