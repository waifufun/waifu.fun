/**
 * Regression suite for the launch-page API client unwrap.
 *
 * Context: the waifu-core v2 API wraps every response in
 * `{ ok: true, data: T, requestId }`. Before this fix, fetchPublicLaunch
 * returned the envelope raw, leaving the React layer reading
 * `meta.data?.vaultAddress` (undefined) and rendering the BASED/32 BNB/no-logo
 * fallback even when the API was healthy. See
 * apps/frontend/src/app/launch/[id]/launch-page-client.tsx for the consumer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { type PublicLaunchExtended, fetchDepositors, fetchPublicLaunch } from "./api";

const sampleLaunch: PublicLaunchExtended = {
	launchId: "ec887db9-782f-4df3-88ab-bd74e621beb9",
	agentId: null,
	status: "launched",
	creatorAddress: "0xc9846a839c4e1d9050dc890a25661ab13224e9ec",
	tokenAddress: "0x15fc6086064afe50ccf4c70000c55cecb6e17777",
	taxRecipient: null,
	firstBuyWei: "0",
	launchAuthorizedAt: null,
	launchAuthorizedBy: null,
	errorMessage: null,
	vaultAddress: "0xfff9b678ebfdac12aafeef1810fad2998ced4bbc",
	tier: "TIER_95",
	presaleCapWei: "64000000000000000000",
	closeAt: "2026-05-22T07:41:19.000Z",
	tokenName: "Sol the Architect",
	tokenTicker: "WAIFU",
	tokenImageUrl: "https://ipfs.io/ipfs/bafybeif5rgiemzzwluj4f7p7gogv2zctx4l6eywxeklqum4xq3mvia67nq",
};

const mockFetch = (body: unknown, status = 200) =>
	vi.spyOn(global, "fetch").mockResolvedValueOnce(
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		}),
	);

afterEach(() => {
	vi.restoreAllMocks();
});

describe("fetchPublicLaunch", () => {
	it("unwraps the { ok, data, requestId } envelope", async () => {
		mockFetch({ ok: true, data: sampleLaunch, requestId: "req-1" });
		const result = await fetchPublicLaunch(sampleLaunch.launchId);
		expect(result).not.toBeNull();
		expect(result?.vaultAddress).toBe(sampleLaunch.vaultAddress);
		expect(result?.tier).toBe("TIER_95");
		expect(result?.tokenName).toBe("Sol the Architect");
		expect(result?.presaleCapWei).toBe("64000000000000000000");
		expect(result?.status).toBe("launched");
	});

	it("accepts a flat response (no envelope) for forward-compat", async () => {
		mockFetch(sampleLaunch);
		const result = await fetchPublicLaunch(sampleLaunch.launchId);
		expect(result?.vaultAddress).toBe(sampleLaunch.vaultAddress);
		expect(result?.tier).toBe("TIER_95");
	});

	it("returns null on 404", async () => {
		mockFetch({ ok: false, error: "NOT_FOUND", message: "not found" }, 404);
		const result = await fetchPublicLaunch("missing-id");
		expect(result).toBeNull();
	});
});

describe("fetchDepositors", () => {
	it("unwraps the envelope and reads .depositors[]", async () => {
		mockFetch({
			ok: true,
			data: {
				depositors: [
					{
						kind: "deposit",
						address: "0xabc",
						amountWei: "1000000000000000000",
						timestamp: "2026-05-22T07:00:00.000Z",
					},
				],
				count: 1,
				total: 1,
			},
			requestId: "req-2",
		});
		const result = await fetchDepositors(sampleLaunch.launchId);
		expect(result).toHaveLength(1);
		expect(result[0]?.address).toBe("0xabc");
	});

	it("unwraps the envelope and reads .events[] (legacy shape)", async () => {
		mockFetch({
			ok: true,
			data: {
				events: [
					{
						kind: "withdraw",
						address: "0xdef",
						amountWei: "5",
						timestamp: "2026-05-22T07:30:00.000Z",
					},
				],
			},
		});
		const result = await fetchDepositors(sampleLaunch.launchId);
		expect(result).toHaveLength(1);
		expect(result[0]?.kind).toBe("withdraw");
	});

	it("accepts a flat array (no envelope) for forward-compat", async () => {
		mockFetch([
			{
				kind: "deposit",
				address: "0x111",
				amountWei: "2",
				timestamp: "2026-05-22T07:00:00.000Z",
			},
		]);
		const result = await fetchDepositors(sampleLaunch.launchId);
		expect(result).toHaveLength(1);
		expect(result[0]?.address).toBe("0x111");
	});

	it("returns [] when the envelope payload is empty", async () => {
		mockFetch({ ok: true, data: { depositors: [], count: 0, total: 0 } });
		const result = await fetchDepositors(sampleLaunch.launchId);
		expect(result).toEqual([]);
	});

	it("returns [] on 404 so the on-chain event fallback can take over", async () => {
		mockFetch({ ok: false, error: "NOT_FOUND" }, 404);
		const result = await fetchDepositors("missing-id");
		expect(result).toEqual([]);
	});
});
