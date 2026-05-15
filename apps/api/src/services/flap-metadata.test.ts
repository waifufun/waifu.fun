import assert from "node:assert/strict";
import test from "node:test";

import { FlapMetadataError, validateFlapMetadataCid } from "./flap-metadata.js";

test("validateFlapMetadataCid fetches and validates required metadata fields", async () => {
	const calls: string[] = [];
	const result = await validateFlapMetadataCid("bafybeigdyrztvalidcid123456789", {
		gatewayBaseUrl: "https://funcs.flap.sh/api/",
		fetchImpl: (async (url: string) => {
			calls.push(url);
			return new Response(JSON.stringify({ name: "Waifu", symbol: "WF", description: "desc", image: "ipfs://image" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch,
	});
	assert.equal(result.cid, "bafybeigdyrztvalidcid123456789");
	assert.equal(result.metadata.symbol, "WF");
	assert.equal(calls[0], "https://funcs.flap.sh/api/bafybeigdyrztvalidcid123456789");
});

test("validateFlapMetadataCid rejects incomplete metadata", async () => {
	await assert.rejects(
		() =>
			validateFlapMetadataCid("bafybeigdyrztvalidcid123456789", {
				fetchImpl: (async () => new Response(JSON.stringify({ name: "x" }), { status: 200 })) as typeof fetch,
			}),
		(error: unknown) => error instanceof FlapMetadataError && error.code === "INVALID_METADATA",
	);
});
