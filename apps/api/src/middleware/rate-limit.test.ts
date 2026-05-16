import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import { __resetRateLimitBucketsForTest, rateLimit } from "./rate-limit.js";

test("rateLimit enforces explicit limits", async () => {
	__resetRateLimitBucketsForTest();
	const app = new Hono<AppBindings>();
	app.use(
		"*",
		rateLimit({
			bucket: "unit",
			limit: 2,
			windowMs: 60_000,
			keyGenerator: () => "attacker",
		}),
	);
	app.get("/", (c) => c.text("ok"));

	assert.equal((await app.request("/")).status, 200);
	assert.equal((await app.request("/")).status, 200);
	const limited = await app.request("/");
	assert.equal(limited.status, 429);
	assert.equal(limited.headers.get("X-RateLimit-Remaining"), "0");
});

test("rateLimit uses bounded defaults for sensitive buckets", async () => {
	__resetRateLimitBucketsForTest();
	const app = new Hono<AppBindings>();
	app.use(
		"*",
		rateLimit({
			bucket: "auth",
			keyGenerator: () => "default-bucket-test",
		}),
	);
	app.get("/", (c) => c.text("ok"));

	let response = await app.request("/");
	for (let i = 0; i < 60; i += 1) {
		response = await app.request("/");
	}

	assert.equal(response.status, 429);
	assert.equal(response.headers.get("X-RateLimit-Limit"), "60");
});
