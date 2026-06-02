import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db";

import app, { __setAppsRouteDepsForTest } from "./apps.js";

const TOKEN = "0x0000000000000000000000000000000000000001";

function stewardAuth() {
	return { mode: "steward" as const, principal: { userId: "user-1", tenantId: "tenant-1", wallets: [] } };
}

function resetAppsDeps() {
	__setAppsRouteDepsForTest({});
}

test("image-gen register stores normalized metadata.settlementMode", async () => {
	const captured: { inserted?: Record<string, unknown> } = {};
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve([
										{
											id: 1,
											agentId: "agent-1",
											ownerStewardUserId: "user-1",
											ownerAddress: null,
											tokenAddress: TOKEN,
										},
									]);
								},
							};
						},
					};
				},
			};
		},
		insert() {
			return {
				values(values: Record<string, unknown>) {
					captured.inserted = values;
					return {
						onConflictDoUpdate() {
							return {
								returning() {
									return Promise.resolve([{ ...values, id: 9n, createdAt: new Date(), updatedAt: new Date() }]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setAppsRouteDepsForTest({ db, auth: stewardAuth(), createElizaImageApp: async () => "eliza-app-1" });
	try {
		const res = await app.request(`/agents/${TOKEN}/apps/image-gen/register`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ settlementMode: "auto" }),
		});
		assert.equal(res.status, 200);
		const metadata = captured.inserted?.metadata as Record<string, unknown> | undefined;
		assert.equal(metadata?.settlementMode, "auto");
		assert.equal(metadata?.escrowThresholdUsd, 1);
		assert.equal(metadata?.estimatedCostUsd, 0);
	} finally {
		resetAppsDeps();
	}
});

test("image-gen invoke returns clean gated error for escrow settlement with flag off", async () => {
	const previousFlag = process.env.ENABLE_ERC8183_ESCROW;
	delete process.env.ENABLE_ERC8183_ESCROW;
	let generatedCalls = 0;
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve([
										{
											id: 1n,
											agentTokenAddress: TOKEN,
											appId: "image-gen",
											status: "live",
											revenueLifetimeUsd: "0",
											revenue24hUsd: "0",
											revenue7dUsd: "0",
											metadata: { settlementMode: "escrow", elizaCloudAppId: "eliza-app-1" },
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setAppsRouteDepsForTest({
		db,
		auth: stewardAuth(),
		generateImageThroughEliza: async () => {
			generatedCalls += 1;
			throw new Error("should not call credits path");
		},
	});
	try {
		const res = await app.request(`/agents/${TOKEN}/apps/image-gen/invoke`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-eliza-cloud-api-key": "caller-key" },
			body: JSON.stringify({ prompt: "draw a cat", idempotencyKey: "escrow-1" }),
		});
		assert.equal(res.status, 501);
		assert.deepEqual(await res.json(), {
			ok: false,
			error: "ESCROW_SETTLEMENT_NOT_YET_ENABLED",
			message: "ERC-8183 escrow settlement is flag-gated and not enabled for mini-app invocations yet.",
			settlementMode: "escrow",
		});
		assert.equal(generatedCalls, 0);
	} finally {
		if (previousFlag === undefined) delete process.env.ENABLE_ERC8183_ESCROW;
		else process.env.ENABLE_ERC8183_ESCROW = previousFlag;
		resetAppsDeps();
	}
});

test("image-gen invoke with escrow flag on still returns stubbed 501 until ERC-8183 wiring lands", async () => {
	const previousFlag = process.env.ENABLE_ERC8183_ESCROW;
	process.env.ENABLE_ERC8183_ESCROW = "true";
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve([
										{
											id: 1n,
											agentTokenAddress: TOKEN,
											appId: "image-gen",
											status: "live",
											metadata: { settlementMode: "escrow", elizaCloudAppId: "eliza-app-1" },
										},
									]);
								},
							};
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setAppsRouteDepsForTest({ db, auth: stewardAuth() });
	try {
		const res = await app.request(`/agents/${TOKEN}/apps/image-gen/invoke`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-eliza-cloud-api-key": "caller-key" },
			body: JSON.stringify({ prompt: "draw a cat", idempotencyKey: "escrow-flag-on" }),
		});
		assert.equal(res.status, 501);
		const body = (await res.json()) as { error: string; settlementMode: string };
		assert.equal(body.error, "ESCROW_SETTLEMENT_NOT_YET_ENABLED");
		assert.equal(body.settlementMode, "escrow");
	} finally {
		if (previousFlag === undefined) delete process.env.ENABLE_ERC8183_ESCROW;
		else process.env.ENABLE_ERC8183_ESCROW = previousFlag;
		resetAppsDeps();
	}
});

test("image-gen invoke keeps credits settlement on the existing Eliza Cloud path", async () => {
	let generatedCalls = 0;
	let updateCalls = 0;
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return {
								limit() {
									return Promise.resolve([
										{
											id: 1n,
											agentTokenAddress: TOKEN,
											appId: "image-gen",
											status: "live",
											revenueLifetimeUsd: "0",
											revenue24hUsd: "0",
											revenue7dUsd: "0",
											metadata: { settlementMode: "credits", elizaCloudAppId: "eliza-app-1" },
										},
									]);
								},
							};
						},
					};
				},
			};
		},
		update() {
			return {
				set() {
					updateCalls += 1;
					return {
						where() {
							return { returning: () => Promise.resolve(updateCalls === 1 ? [{ id: 1n }] : []) };
						},
					};
				},
			};
		},
	} as unknown as Database;

	__setAppsRouteDepsForTest({
		db,
		auth: stewardAuth(),
		generateImageThroughEliza: async () => {
			generatedCalls += 1;
			return {
				success: true,
				appId: "eliza-app-1",
				model: "test-model",
				images: [{ url: "https://img.example/cat.png" }],
				charge: { status: "charged", currency: "USD", totalCost: 0.01 },
			};
		},
		fetchElizaEarnings: async () => null,
	});
	try {
		const res = await app.request(`/agents/${TOKEN}/apps/image-gen/invoke`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-eliza-cloud-api-key": "caller-key" },
			body: JSON.stringify({ prompt: "draw a cat", idempotencyKey: "credits-1" }),
		});
		assert.equal(res.status, 200);
		const body = (await res.json()) as { ok: boolean; data: { imageUrl: string; settlementMode: string } };
		assert.equal(body.ok, true);
		assert.equal(body.data.imageUrl, "https://img.example/cat.png");
		assert.equal(body.data.settlementMode, "credits");
		assert.equal(generatedCalls, 1);
		assert.equal(updateCalls, 2);
	} finally {
		resetAppsDeps();
	}
});
