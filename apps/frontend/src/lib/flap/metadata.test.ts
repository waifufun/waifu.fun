import { describe, expect, it, vi } from "vitest";

import {
	FLAP_METADATA_UPLOAD_URL,
	FlapMetadataUploadError,
	buildFlapMetadataPayload,
	shortenCid,
	uploadFlapMetadata,
} from "./metadata";

function fakeImage(): Blob {
	return new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
}

describe("buildFlapMetadataPayload", () => {
	it("includes core fields and skips empty socials", () => {
		const payload = buildFlapMetadataPayload({
			name: "Eliza",
			symbol: "ELIZA",
			description: "a quiet treasury manager",
		});
		expect(payload).toEqual({
			name: "Eliza",
			symbol: "ELIZA",
			description: "a quiet treasury manager",
		});
	});

	it("includes socials when present and trims them", () => {
		const payload = buildFlapMetadataPayload({
			name: "Eliza",
			symbol: "ELIZA",
			description: "hi",
			twitter: "  @waifu  ",
			telegram: " ",
			website: "https://waifu.fun",
		});
		expect(payload).toEqual({
			name: "Eliza",
			symbol: "ELIZA",
			description: "hi",
			twitter: "@waifu",
			website: "https://waifu.fun",
		});
	});
});

describe("uploadFlapMetadata", () => {
	it("posts multipart/form-data to the flap endpoint and parses the cid", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ cid: "bafkreigh2akiscaildc", uri: "ipfs://bafkreigh2akiscaildc" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const result = await uploadFlapMetadata(
			{
				name: "Eliza",
				symbol: "ELIZA",
				description: "hi",
				image: fakeImage(),
			},
			{ fetchImpl: fetchImpl as unknown as typeof fetch },
		);

		expect(result.cid).toBe("bafkreigh2akiscaildc");
		expect(result.uri).toBe("ipfs://bafkreigh2akiscaildc");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const call = fetchImpl.mock.calls[0];
		if (!call) throw new Error("fetchImpl was not called");
		const [url, init] = call;
		expect(url).toBe(FLAP_METADATA_UPLOAD_URL);
		expect((init as RequestInit).method).toBe("POST");
		const body = (init as RequestInit).body as FormData;
		expect(body).toBeInstanceOf(FormData);
		expect(body.get("image")).toBeInstanceOf(Blob);
		expect(body.get("metadata")).toBeInstanceOf(Blob);
	});

	it("defaults the uri to ipfs://<cid> when the server omits it", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ cid: "bafy123" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		const result = await uploadFlapMetadata(
			{ name: "n", symbol: "S", description: "d", image: fakeImage() },
			{ fetchImpl: fetchImpl as unknown as typeof fetch },
		);
		expect(result.uri).toBe("ipfs://bafy123");
	});

	it("throws FlapMetadataUploadError on non-2xx", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response("internal flap fault", { status: 500, statusText: "server error" }));
		await expect(
			uploadFlapMetadata(
				{ name: "n", symbol: "S", description: "d", image: fakeImage() },
				{ fetchImpl: fetchImpl as unknown as typeof fetch },
			),
		).rejects.toBeInstanceOf(FlapMetadataUploadError);
	});

	it("throws FlapMetadataUploadError on network failure", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
		await expect(
			uploadFlapMetadata(
				{ name: "n", symbol: "S", description: "d", image: fakeImage() },
				{ fetchImpl: fetchImpl as unknown as typeof fetch },
			),
		).rejects.toBeInstanceOf(FlapMetadataUploadError);
	});

	it("throws if cid is missing from a 200 response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ uri: "ipfs://noop" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		await expect(
			uploadFlapMetadata(
				{ name: "n", symbol: "S", description: "d", image: fakeImage() },
				{ fetchImpl: fetchImpl as unknown as typeof fetch },
			),
		).rejects.toMatchObject({ name: "FlapMetadataUploadError" });
	});
});

describe("shortenCid", () => {
	it("returns the cid as-is when short", () => {
		expect(shortenCid("bafy")).toBe("bafy");
	});
	it("truncates long cids with an ellipsis", () => {
		expect(shortenCid("bafkreigh2akiscaildc01234567890")).toBe("bafkreig…7890");
	});
	it("handles empty input", () => {
		expect(shortenCid("")).toBe("");
	});
});
