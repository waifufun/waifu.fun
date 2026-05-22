import assert from "node:assert/strict";
import test from "node:test";

import app from "./agents-twitter-tweets.js";

test("GET /:address/tweets rejects malformed addresses", async () => {
	const previous = process.env.DATABASE_URL;
	process.env.DATABASE_URL = "postgres://stub/stub";
	try {
		const res = await app.request("/0xnotvalid/tweets");
		assert.equal(res.status, 400);
		const body = (await res.json()) as { ok: boolean; error: string };
		assert.equal(body.ok, false);
		assert.match(body.error, /invalid agent address/);
	} finally {
		if (previous === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = previous;
	}
});

test("GET /:address/tweets returns 503 when DATABASE_URL is not set", async () => {
	const previous = process.env.DATABASE_URL;
	delete process.env.DATABASE_URL;
	try {
		const res = await app.request("/0x15fc6086064afe50ccf4c70000c55cecb6e17777/tweets");
		assert.equal(res.status, 503);
		const body = (await res.json()) as { ok: boolean; error: string };
		assert.equal(body.ok, false);
		assert.match(body.error, /database unavailable/);
	} finally {
		if (previous !== undefined) process.env.DATABASE_URL = previous;
	}
});
