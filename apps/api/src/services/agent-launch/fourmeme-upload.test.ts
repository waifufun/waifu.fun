import assert from "node:assert/strict";
import test from "node:test";

import { FourMemeError } from "./errors.js";
import { fourMemeUploadImage } from "./fourmeme-upload.js";

const publicLookup = async (): Promise<string[]> => ["93.184.216.34"];

test("fourMemeUploadImage rejects imageUrl SSRF targets before fetch", async () => {
	let calls = 0;
	await assert.rejects(
		fourMemeUploadImage(
			"token",
			{ imageUrl: "http://127.0.0.1/private.png" },
			{
				baseUrl: "https://four.test",
				fetchImpl: async () => {
					calls += 1;
					return new Response("nope");
				},
			},
		),
		(error: unknown) =>
			error instanceof FourMemeError &&
			error.message.includes("failed to fetch imageUrl") &&
			error.message.includes("blocked_address"),
	);
	assert.equal(calls, 0);
});

test("fourMemeUploadImage rejects oversized remote images", async () => {
	await assert.rejects(
		fourMemeUploadImage(
			"token",
			{ imageUrl: "https://media.test/large.png" },
			{
				baseUrl: "https://four.test",
				lookupIpAddresses: publicLookup,
				fetchImpl: async () =>
					new Response(null, {
						headers: {
							"content-type": "image/png",
							"content-length": String(11 * 1024 * 1024),
						},
					}),
			},
		),
		(error: unknown) =>
			error instanceof FourMemeError &&
			error.message.includes("failed to fetch imageUrl") &&
			error.message.includes("response_too_large"),
	);
});

test("fourMemeUploadImage uploads a public bounded image", async () => {
	const seenUrls: string[] = [];
	const result = await fourMemeUploadImage(
		"token",
		{ imageUrl: "https://media.test/token.png" },
		{
			baseUrl: "https://four.test",
			lookupIpAddresses: publicLookup,
			fetchImpl: async (url) => {
				seenUrls.push(String(url));
				if (String(url).includes("/v1/private/token/upload")) {
					return new Response(JSON.stringify({ code: "0", data: "https://cdn.four.test/token.png" }), {
						headers: { "content-type": "application/json" },
					});
				}
				return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
			},
		},
	);
	assert.deepEqual(result, { imageUrl: "https://cdn.four.test/token.png" });
	assert.deepEqual(seenUrls, ["https://media.test/token.png", "https://four.test/v1/private/token/upload"]);
});
