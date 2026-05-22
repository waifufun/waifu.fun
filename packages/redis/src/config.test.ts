import assert from "node:assert/strict";
import test from "node:test";

import { assertRedisUrlAllowed, getRedisUrl, redisOptionsFromEnv } from "./config.js";

test("getRedisUrl fails closed without REDIS_URL in production", () => {
	assert.throws(() => getRedisUrl({ NODE_ENV: "production" }), /REDIS_URL is required/);
});

test("production Redis URLs require password credentials", () => {
	assert.throws(
		() => assertRedisUrlAllowed("redis://cache.example.com:6379/0", { NODE_ENV: "production" }),
		/credentials/,
	);

	assert.doesNotThrow(() =>
		assertRedisUrlAllowed("redis://default:secret@cache.example.com:6379/0", { NODE_ENV: "production" }),
	);
	assert.doesNotThrow(() =>
		assertRedisUrlAllowed("redis://cache.example.com:6379/0", {
			NODE_ENV: "production",
			REDIS_PASSWORD: "secret",
		}),
	);
});

test("redisOptionsFromEnv wires ACL, DB, and TLS options", () => {
	assert.deepEqual(
		redisOptionsFromEnv({
			REDIS_URL: "rediss://acl-user:url-secret@cache.example.com:6380/2",
			REDIS_USERNAME: "acl-user",
			REDIS_PASSWORD: "env-secret",
			REDIS_DB: "4",
		}),
		{
			username: "acl-user",
			password: "env-secret",
			db: 4,
			tls: {},
		},
	);
});
