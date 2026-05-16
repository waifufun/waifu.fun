import assert from "node:assert/strict";
import test from "node:test";

import { SafeFetchError, safeFetchBytes } from "../src/lib/safe-url-fetch.js";

test("worker safeFetchBytes blocks IPv4-mapped IPv6 loopback literals before fetch", async () => {
	let fetched = false;
	await assert.rejects(
		safeFetchBytes("https://[::ffff:7f00:1]/image.png", {
			maxBytes: 1024,
			fetchImpl: async () => {
				fetched = true;
				return new Response("nope");
			},
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_address",
	);
	assert.equal(fetched, false);
});

test("worker safeFetchBytes validates IPv4-mapped IPv6 redirect targets before fetching them", async () => {
	let calls = 0;
	await assert.rejects(
		safeFetchBytes("https://image.test/avatar.png", {
			maxBytes: 1024,
			lookupIpAddresses: async () => ["93.184.216.34"],
			fetchImpl: async () => {
				calls += 1;
				return new Response(null, {
					status: 302,
					headers: { location: "https://[::ffff:7f00:1]/latest/meta-data/" },
				});
			},
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_address",
	);
	assert.equal(calls, 1);
});

test("worker safeFetchBytes enforces image MIME and streamed byte limits", async () => {
	await assert.rejects(
		safeFetchBytes("https://image.test/avatar.png", {
			maxBytes: 1024,
			allowedContentTypes: ["image/"],
			lookupIpAddresses: async () => ["93.184.216.34"],
			fetchImpl: async () => new Response("not an image", { headers: { "content-type": "text/plain" } }),
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_content_type",
	);

	await assert.rejects(
		safeFetchBytes("https://image.test/avatar.png", {
			maxBytes: 2,
			allowedContentTypes: ["image/"],
			lookupIpAddresses: async () => ["93.184.216.34"],
			fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "response_too_large",
	);
});
