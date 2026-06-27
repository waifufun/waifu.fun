import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";

import type { Database } from "@waifufun/db";

import app, { __setAppsRouteDepsForTest, composePrompt, isInsufficientCreditsError, normalizePrompt } from "./apps.js";

const TOKEN = "0x0000000000000000000000000000000000000001";
const TOKEN_913 = "0x15fc6086064afe50ccf4c70000c55cecb6e17777";

afterEach(() => {
	__setAppsRouteDepsForTest({});
	mock.restoreAll();
});

function stewardAuth() {
	return { mode: "steward" as const, principal: { userId: "user-1", tenantId: "tenant-1", wallets: [] } };
}

function resetAppsDeps() {
	__setAppsRouteDepsForTest({});
}

// ── settlement-mode suite (#915) ─────────────────────────────────

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

// ── image-gen validation + invoke suite (#913) ──────────────────

test("normalizePrompt rejects short and over-long prompts", () => {
	assert.deepEqual(normalizePrompt({ prompt: "hi" }), { error: "prompt must be 3 to 1800 characters" });
	assert.deepEqual(normalizePrompt({ prompt: "x".repeat(1801) }), {
		error: "prompt must be 3 to 1800 characters",
	});
	assert.deepEqual(normalizePrompt({ prompt: 42 }), { error: "prompt must be 3 to 1800 characters" });
});

test("normalizePrompt trims, defaults aspect to 1:1, and clamps style", () => {
	const ok = normalizePrompt({ prompt: "  a sunlit kitchen  ", style: "  watercolor  ", aspect: "16:9" });
	assert.deepEqual(ok, {
		prompt: "a sunlit kitchen",
		style: "watercolor",
		aspect: "16:9",
		model: "google/gemini-2.5-flash-image",
	});

	const noStyle = normalizePrompt({ prompt: "a cat", aspect: "not-an-aspect" });
	assert.deepEqual(noStyle, {
		prompt: "a cat",
		style: null,
		aspect: "1:1",
		model: "google/gemini-2.5-flash-image",
	});
});

test("composePrompt appends style only when present", () => {
	assert.equal(composePrompt({ prompt: "a cat", style: null }), "a cat");
	assert.equal(composePrompt({ prompt: "a cat", style: "noir" }), "a cat\n\nStyle: noir");
});

test("isInsufficientCreditsError recognises 402 and balance phrasings", () => {
	assert.equal(isInsufficientCreditsError(new Error("Eliza Cloud request failed (402): no credits")), true);
	assert.equal(isInsufficientCreditsError(new Error("Insufficient balance to charge")), true);
	assert.equal(isInsufficientCreditsError(new Error("payment required")), true);
	assert.equal(isInsufficientCreditsError(new Error("Eliza Cloud request failed (500): boom")), false);
	assert.equal(isInsufficientCreditsError(undefined), false);
});

// ── invoke route: app-not-live gate ──────────────────────────────

function selectOnlyDb(rows: unknown[]): never {
	// Minimal drizzle-shaped stub that only supports the leading
	// select().from().where().limit() chain used to look up the app row.
	return {
		select() {
			return {
				from() {
					return {
						where() {
							return { limit: () => Promise.resolve(rows) };
						},
					};
				},
			};
		},
	} as never;
}

test("POST invoke returns 404 when the image-gen app is not live", async () => {
	__setAppsRouteDepsForTest({
		db: selectOnlyDb([]),
		auth: { mode: "steward", principal: { userId: "u1" } as never },
	});

	const res = await app.request(`/agents/${TOKEN_913}/apps/image-gen/invoke`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ prompt: "a sunlit kitchen" }),
	});
	assert.equal(res.status, 404);
	const json = (await res.json()) as { ok: boolean; error: string };
	assert.equal(json.ok, false);
	assert.equal(json.error, "NOT_FOUND");
});

test("POST invoke returns 400 on an invalid prompt before touching billing", async () => {
	__setAppsRouteDepsForTest({
		db: selectOnlyDb([
			{
				id: 1n,
				appId: "image-gen",
				status: "live",
				agentTokenAddress: TOKEN_913,
				metadata: { elizaCloudAppId: "eliza-app-1" },
			},
		]),
		auth: { mode: "steward", principal: { userId: "u1" } as never },
	});
	// Guard: if billing were reached it would throw on the mocked-absent fetch.
	const res = await app.request(`/agents/${TOKEN_913}/apps/image-gen/invoke`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ prompt: "hi" }),
	});
	assert.equal(res.status, 400);
});

// ── invoke route: happy path with a MOCKED paid call ─────────────

test("POST invoke generates an image through a mocked Eliza Cloud charge (no real spend)", async () => {
	process.env.ELIZA_CLOUD_IMAGE_GEN_CALLER_API_KEY = "test-caller-key";

	// Stub the only paid surface: the Eliza Cloud HTTP calls. We never let a
	// real fetch fire, so no fal/eliza credits are ever spent in CI.
	mock.method(globalThis, "fetch", async (input: unknown) => {
		const url = String(input);
		if (url.includes("/generate-image")) {
			return new Response(
				JSON.stringify({
					success: true,
					model: "google/gemini-2.5-flash-image",
					images: [{ url: "https://cdn.example/test-image.png" }],
					charge: { status: "charged", currency: "USD", baseCost: 0.01, creatorMarkup: 0.01, totalCost: 0.02 },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}
		if (url.includes("/earnings")) {
			return new Response(JSON.stringify({ success: true, monetization: { totalCreatorEarnings: 0.01 } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		throw new Error(`unexpected fetch in test: ${url}`);
	});

	// DB stub that supports the full invoke chain: select().from().where().limit(),
	// then the reservation update().set().where().returning(), then the final
	// metrics update().set().where().
	const liveRow = {
		id: 7n,
		appId: "image-gen",
		status: "live",
		agentTokenAddress: TOKEN_913,
		revenueLifetimeUsd: "0",
		revenue24hUsd: "0",
		revenue7dUsd: "0",
		metadata: { elizaCloudAppId: "eliza-app-1", inferenceMarkupPercentage: 100 },
	};
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return { limit: () => Promise.resolve([liveRow]) };
						},
					};
				},
			};
		},
		update() {
			return {
				set() {
					return {
						where() {
							// reservation path returns .returning(); final path resolves directly.
							const chain: Record<string, unknown> = Promise.resolve() as never;
							(chain as { returning: () => Promise<unknown[]> }).returning = () => Promise.resolve([{ id: 7n }]);
							return chain;
						},
					};
				},
			};
		},
	} as never;

	__setAppsRouteDepsForTest({ db, auth: { mode: "steward", principal: { userId: "u1" } as never } });

	const res = await app.request(`/agents/${TOKEN_913}/apps/image-gen/invoke`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ prompt: "a sunlit kitchen at 2am", aspect: "3:4" }),
	});

	assert.equal(res.status, 200);
	const json = (await res.json()) as {
		ok: boolean;
		data: { imageUrl: string; aspect: string; charge: { status: string; totalCost: number } };
	};
	assert.equal(json.ok, true);
	assert.equal(json.data.imageUrl, "https://cdn.example/test-image.png");
	assert.equal(json.data.aspect, "3:4");
	assert.equal(json.data.charge.status, "charged");
	assert.equal(json.data.charge.totalCost, 0.02);
});

test("POST invoke maps an exhausted-credit Eliza charge to a 402 (mocked, no real spend)", async () => {
	process.env.ELIZA_CLOUD_IMAGE_GEN_CALLER_API_KEY = "test-caller-key";

	mock.method(globalThis, "fetch", async (input: unknown) => {
		const url = String(input);
		if (url.includes("/generate-image")) {
			return new Response(JSON.stringify({ error: "insufficient credits" }), {
				status: 402,
				headers: { "content-type": "application/json" },
			});
		}
		throw new Error(`unexpected fetch in test: ${url}`);
	});

	const liveRow = {
		id: 9n,
		appId: "image-gen",
		status: "live",
		agentTokenAddress: TOKEN_913,
		metadata: { elizaCloudAppId: "eliza-app-1", inferenceMarkupPercentage: 100 },
	};
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return { limit: () => Promise.resolve([liveRow]) };
						},
					};
				},
			};
		},
		update() {
			return {
				set() {
					return {
						where() {
							const chain: Record<string, unknown> = Promise.resolve() as never;
							(chain as { returning: () => Promise<unknown[]> }).returning = () => Promise.resolve([{ id: 9n }]);
							return chain;
						},
					};
				},
			};
		},
	} as never;

	__setAppsRouteDepsForTest({ db, auth: { mode: "steward", principal: { userId: "u1" } as never } });

	const res = await app.request(`/agents/${TOKEN_913}/apps/image-gen/invoke`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ prompt: "a sunlit kitchen" }),
	});
	assert.equal(res.status, 402);
	const json = (await res.json()) as { ok: boolean; error: string };
	assert.equal(json.ok, false);
	assert.equal(json.error, "INSUFFICIENT_CREDITS");
});
