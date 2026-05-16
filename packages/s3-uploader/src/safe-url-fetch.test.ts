import assert from "node:assert/strict";
import test from "node:test";

import { SafeFetchError, safeFetchBytes } from "./safe-url-fetch.js";

test("s3 safeFetchBytes blocks DNS that resolves to private ranges", async () => {
	await assert.rejects(
		safeFetchBytes("https://image.test/avatar.png", {
			maxBytes: 1024,
			lookupIpAddresses: async () => ["192.168.1.10"],
			fetchImpl: async () => new Response("nope"),
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_address",
	);
});

test("s3 safeFetchBytes rejects oversized image responses", async () => {
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
