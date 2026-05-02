import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { Hono } from "hono";

import {
	__setRequirePatronDbForTest,
	__setRequirePatronStewardParserForTest,
} from "../../src/middleware/patron-auth.ts";
import launchAuthorizeRoutes, { __setLaunchAuthorizeDepsForTest } from "../../src/routes/v2/launches-authorize.ts";

const OWNER = "0x1111111111111111111111111111111111111111";
const SAFE = "0x3333333333333333333333333333333333333333";

function provisionedLaunch() {
	return {
		id: "launch-int-1",
		launchId: "launch-int-1",
		status: "provisioned",
		chainId: 56,
		portalAddress: "0x4444444444444444444444444444444444444444",
		quoteToken: null,
		tokenName: "Integration Waifu",
		tokenTicker: "IWFU",
		tokenDescription: "integration",
		tokenImageUrl: "ipfs://image",
		socials: { website: "https://waifu.fun" },
		taxRate: 500,
		agentPersonaId: "persona-uuid",
		agentId: "waifu-integration",
		personaUuid: "persona-uuid",
		personaAgentId: "waifu-integration",
		ownerAddress: OWNER,
		safeAddress: SAFE,
	};
}

function fakeDb(row: Record<string, unknown>) {
	let current = { ...row };
	return {
		get current() {
			return current;
		},
		select() {
			return {
				from() {
					return this;
				},
				leftJoin() {
					return this;
				},
				where() {
					return this;
				},
				limit() {
					return [current];
				},
			};
		},
		update() {
			return {
				set(patch: Record<string, unknown>) {
					current = { ...current, ...patch };
					return this;
				},
				where() {
					return this;
				},
				returning() {
					return [{ id: current.id, status: current.status }];
				},
			};
		},
	};
}

afterEach(() => {
	__setRequirePatronDbForTest(undefined);
	__setRequirePatronStewardParserForTest(undefined);
	__setLaunchAuthorizeDepsForTest(undefined);
});

test("launch authorize end-to-end with mocked Safe balance and Steward signer handoff", async () => {
	const db = fakeDb(provisionedLaunch());
	const queuedJobs: unknown[] = [];
	const emitted: unknown[] = [];
	const stewardSigner = { mode: "mocked-steward-signer", willSubmitFourMemeTx: true };

	__setRequirePatronDbForTest(db as never);
	__setRequirePatronStewardParserForTest(async () => ({ userId: "steward-1", tenantId: "waifu" }));
	__setLaunchAuthorizeDepsForTest({
		db: db as never,
		getSafeBalanceWei: async (safeAddress) => {
			assert.equal(safeAddress, SAFE);
			return 50n;
		},
		enqueueLaunchPrep: async (job, opts) => {
			queuedJobs.push({ job, opts, stewardSigner });
			return {} as never;
		},
		emitEvent: async (event) => {
			emitted.push(event);
			return {} as never;
		},
		now: () => new Date("2026-04-24T00:00:00.000Z"),
	});

	const app = new Hono();
	app.route("/v2/launches", launchAuthorizeRoutes);

	const res = await app.request("http://unit.test/v2/launches/launch-int-1/authorize", {
		method: "POST",
		headers: {
			authorization: "Bearer steward-token",
			"content-type": "application/json",
		},
		body: JSON.stringify({ address: OWNER, firstBuyWei: "25" }),
	});

	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), {
		launchId: "launch-int-1",
		status: "queued",
		firstBuyWei: "25",
		txHashPending: true,
	});
	assert.equal(db.current.status, "queued");
	assert.equal(db.current.firstBuyWei, "25");
	assert.equal(db.current.launchAuthorizedBy, OWNER);
	assert.equal(queuedJobs.length, 1);
	assert.equal(emitted.length, 1);
	assert.equal((emitted[0] as { eventType: string }).eventType, "launch.authorized");
});
