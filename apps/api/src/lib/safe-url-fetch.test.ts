import assert from "node:assert/strict";
import test from "node:test";

import { SafeFetchError, safeFetchBytes, safeFetchJson } from "./safe-url-fetch.js";

const publicLookup = async (hostname: string): Promise<string[]> => {
	if (hostname === "public.test") return ["93.184.216.34"];
	if (hostname === "metadata.test") return ["169.254.169.254"];
	return ["10.0.0.7"];
};

test("safeFetchBytes blocks literal loopback before fetch", async () => {
	let fetched = false;
	await assert.rejects(
		safeFetchBytes("http://127.0.0.1/admin", {
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

test("safeFetchBytes blocks private addresses returned by DNS", async () => {
	await assert.rejects(
		safeFetchBytes("https://internal.test/image.png", {
			maxBytes: 1024,
			lookupIpAddresses: publicLookup,
			fetchImpl: async () => new Response("nope"),
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_address",
	);
});

test("safeFetchBytes validates redirect targets before following them", async () => {
	let calls = 0;
	await assert.rejects(
		safeFetchBytes("https://public.test/image.png", {
			maxBytes: 1024,
			lookupIpAddresses: publicLookup,
			fetchImpl: async () => {
				calls += 1;
				return new Response(null, {
					status: 302,
					headers: { location: "http://metadata.test/latest/meta-data/" },
				});
			},
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_address",
	);
	assert.equal(calls, 1);
});

test("safeFetchBytes enforces content type and streamed size limits", async () => {
	await assert.rejects(
		safeFetchBytes("https://public.test/image.png", {
			maxBytes: 1024,
			allowedContentTypes: ["image/"],
			lookupIpAddresses: publicLookup,
			fetchImpl: async () => new Response("not an image", { headers: { "content-type": "text/plain" } }),
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_content_type",
	);

	await assert.rejects(
		safeFetchBytes("https://public.test/image.png", {
			maxBytes: 4,
			allowedContentTypes: ["image/"],
			lookupIpAddresses: publicLookup,
			fetchImpl: async () => new Response(new Uint8Array([1, 2, 3, 4, 5]), { headers: { "content-type": "image/png" } }),
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "response_too_large",
	);
});

test("safeFetchJson accepts public JSON within limit", async () => {
	const result = await safeFetchJson<{ ok: boolean }>("https://public.test/meta.json", {
		maxBytes: 1024,
		lookupIpAddresses: publicLookup,
		fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }),
	});
	assert.deepEqual(result, { ok: true });
});
