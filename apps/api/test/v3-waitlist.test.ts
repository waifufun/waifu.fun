import assert from "node:assert/strict";
import test from "node:test";

import { createV3Routes } from "../src/routes/v3/index.js";

test("POST /v3/launchpads/:id/waitlist adds email and returns count", async () => {
	const inserted: unknown[] = [];
	const app = createV3Routes({
		db: {
			insert() {
				return {
					values(input: unknown) {
						inserted.push(input);
						return {
							onConflictDoNothing() {
								return {
									returning: async () => [{ id: "wait-1", email: "fan@example.com", launchpadId: "bags" }],
								};
							},
						};
					},
				};
			},
			select(selection?: unknown) {
				if (selection) {
					return { from: () => ({ where: async () => [{ count: 3 }] }) };
				}
				throw new Error("unexpected select fallback");
			},
		} as never,
	});

	const res = await app.request("/launchpads/bags/waitlist", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email: " Fan@Example.com " }),
	});

	assert.equal(res.status, 201);
	const json = (await res.json()) as { ok: boolean; count: number };
	assert.equal(json.ok, true);
	assert.equal(json.count, 3);
	assert.deepEqual(inserted[0], { email: "fan@example.com", launchpadId: "bags" });
});

test("POST /v3/launchpads/:id/waitlist validates email", async () => {
	const app = createV3Routes({ db: {} as never });
	const res = await app.request("/launchpads/pump-fun/waitlist", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ email: "not-an-email" }),
	});
	assert.equal(res.status, 400);
});
