import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import {
	type RedisRateLimitClient,
	__resetRateLimitBucketsForTest,
	createRedisRateLimitStore,
	rateLimit,
} from "./rate-limit.js";

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

test("rateLimit can use an atomic Redis-style store", async () => {
	const calls: Array<{ key: string; windowMs: string }> = [];
	const counts = new Map<string, number>();
	const redisClient = {
		async eval(_script: string, _keyCount: number, key: string, windowMs: string) {
			const redisKey = String(key);
			const count = (counts.get(redisKey) ?? 0) + 1;
			counts.set(redisKey, count);
			calls.push({ key: redisKey, windowMs: String(windowMs) });
			return [count, Number(windowMs)];
		},
		disconnect() {},
	} as RedisRateLimitClient;
	const store = createRedisRateLimitStore(redisClient);
	const app = new Hono<AppBindings>();
	app.use(
		"*",
		rateLimit({
			bucket: "auth",
			limit: 1,
			windowMs: 1_000,
			store,
			keyGenerator: () => "wallet 0xabc",
		}),
	);
	app.get("/", (c) => c.text("ok"));

	assert.equal((await app.request("/")).status, 200);
	assert.equal((await app.request("/")).status, 429);
	assert.deepEqual(calls, [
		{ key: "waifu:api:rate-limit:auth:wallet_0xabc", windowMs: "1000" },
		{ key: "waifu:api:rate-limit:auth:wallet_0xabc", windowMs: "1000" },
	]);
});

test("Redis-backed rate limiter rejects unauthenticated production REDIS_URL", () => {
	const originalNodeEnv = process.env.NODE_ENV;
	const originalRedisUrl = process.env.REDIS_URL;
	const originalRedisPassword = process.env.REDIS_PASSWORD;

	try {
		process.env.NODE_ENV = "production";
		process.env.REDIS_URL = "redis://cache.example.com:6379/0";
		delete process.env.REDIS_PASSWORD;

		assert.throws(() => createRedisRateLimitStore(), /credentials/);
	} finally {
		if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = originalNodeEnv;
		if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
		else process.env.REDIS_URL = originalRedisUrl;
		if (originalRedisPassword === undefined) delete process.env.REDIS_PASSWORD;
		else process.env.REDIS_PASSWORD = originalRedisPassword;
	}
});
