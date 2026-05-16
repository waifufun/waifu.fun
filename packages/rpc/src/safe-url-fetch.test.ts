import assert from "node:assert/strict";
import test from "node:test";

import { SafeFetchError, safeFetchJson } from "./safe-url-fetch";

test("rpc safeFetchJson blocks unsupported URI schemes", async () => {
	await assert.rejects(
		safeFetchJson("file:///etc/passwd", { maxBytes: 1024 }),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_scheme",
	);
});

test("rpc safeFetchJson blocks metadata URI redirects to link-local addresses", async () => {
	await assert.rejects(
		safeFetchJson("https://meta.test/token.json", {
			maxBytes: 1024,
			lookupIpAddresses: async (hostname) => (hostname === "meta.test" ? ["93.184.216.34"] : ["169.254.169.254"]),
			fetchImpl: async () => new Response(null, { status: 302, headers: { location: "http://aws.test/latest" } }),
		}),
		(error: unknown) => error instanceof SafeFetchError && error.code === "blocked_address",
	);
});

test("rpc safeFetchJson parses bounded public token metadata", async () => {
	const metadata = await safeFetchJson<{ image: string }>("https://meta.test/token.json", {
		maxBytes: 1024,
		lookupIpAddresses: async () => ["93.184.216.34"],
		fetchImpl: async () =>
			new Response(JSON.stringify({ image: "https://cdn.test/token.png" }), {
				headers: { "content-type": "application/json" },
			}),
	});
	assert.equal(metadata.image, "https://cdn.test/token.png");
});
