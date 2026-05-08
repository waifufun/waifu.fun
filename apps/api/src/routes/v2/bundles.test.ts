import assert from "node:assert/strict";
import test from "node:test";

import type { BundleSubmitterDeps } from "../../services/bundle-submitter/index.js";
import { createBundleRoutes } from "./bundles.js";

const FUTURE_DEADLINE = Math.floor(new Date("2030-01-01").getTime() / 1000);

function makeFakeDeps(): BundleSubmitterDeps {
	const rows = new Map<string, Record<string, unknown>>();
	return {
		db: {
			insert() {
				return {
					values(values: Record<string, unknown>) {
						return {
							onConflictDoUpdate() {
								rows.set(values.bundleHash as string, {
									...values,
									status: "included",
									path: "puissant",
									submittedAt: new Date(),
									includedAt: new Date(),
									blockNumber: "1",
									txHash: values.bundleHash,
									includedAtIso: null,
								});
								return Promise.resolve();
							},
						};
					},
				};
			},
			update() {
				return {
					set() {
						return { where: () => Promise.resolve() };
					},
				};
			},
			select() {
				return {
					from() {
						return {
							where(predicate: unknown) {
								// Best-effort: predicate is drizzle eq() output; iterate all rows.
								void predicate;
								return {
									limit() {
										return Promise.resolve(
											Array.from(rows.values()).map((r) => ({
												bundleHash: r.bundleHash,
												txHash: r.txHash ?? null,
												blockNumber: r.blockNumber ?? null,
												status: r.status ?? "submitted",
												path: r.path ?? "puissant",
												submittedAt: r.submittedAt ?? new Date(),
												includedAt: r.includedAt ?? null,
												expiredAt: null,
												fallbackAt: null,
												fallbackTxHash: null,
												lastError: null,
												rawTx: r.rawTx ?? "0xdead",
												chainId: 56,
												deadline: new Date(),
												attempts: 1,
												metadata: {},
												createdAt: new Date(),
												updatedAt: new Date(),
											})),
										);
									},
								};
							},
						};
					},
				};
			},
		} as never,
		puissant: {
			async sendPrivateRawTransaction() {
				return "0xpuissant";
			},
		},
		watcher: {
			async waitForInclusion() {
				return "1";
			},
		},
		publicFallback: undefined,
		now: () => new Date("2026-05-08T12:00:00.000Z"),
		maxBlocks: 5,
		pollMs: 0,
		chainId: 56,
	};
}

test("POST /submit returns 400 on invalid JSON", async () => {
	const app = createBundleRoutes({ deps: makeFakeDeps() });
	const res = await app.request("/submit", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: "not-json",
	});
	assert.equal(res.status, 400);
});

test("POST /submit returns 400 on schema violation", async () => {
	const app = createBundleRoutes({ deps: makeFakeDeps() });
	const res = await app.request("/submit", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ rawTx: "nope", deadline: FUTURE_DEADLINE }),
	});
	assert.equal(res.status, 400);
});

test("POST /submit submits and returns included bundle", async () => {
	const app = createBundleRoutes({ deps: makeFakeDeps() });
	const res = await app.request("/submit", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			rawTx: "0xdeadbeef",
			deadline: FUTURE_DEADLINE,
			fallbackPublic: false,
		}),
	});

	assert.equal(res.status, 200);
	const body = (await res.json()) as { status: string; bundleHash: string };
	assert.equal(body.status, "included");
	assert.match(body.bundleHash, /^0x[0-9a-f]{64}$/);
});

test("GET /:hash returns 400 on malformed hash", async () => {
	const app = createBundleRoutes({ deps: makeFakeDeps() });
	const res = await app.request("/0xnothex");
	assert.equal(res.status, 400);
});

test("GET /:hash returns 404 when bundle missing", async () => {
	const app = createBundleRoutes({ deps: makeFakeDeps() });
	const res = await app.request(`/0x${"a".repeat(64)}`);
	assert.equal(res.status, 404);
});
