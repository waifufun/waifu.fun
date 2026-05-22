import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_ACTIVITY_COPY, mergeActivityWithTrades } from "@/lib/wave-t/activity-trades";
import { fetchAgentOwnTrades } from "@/lib/wave-t/agent-trades";

const ADDRESS = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";

afterEach(() => {
	vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
	vi.spyOn(globalThis, "fetch").mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as Response);
}

describe("fetchAgentOwnTrades", () => {
	it("maps three agent-initiated trades across multiple tokens", async () => {
		mockFetch(200, [
			{
				txHash: "0x1",
				trader: "0x440e903000000000000000000000000000000000",
				traderRole: "agent-safe",
				tokenAddress: "0xwaifu",
				tokenSymbol: "WAIFU",
				side: "buy",
				amountIn: "1.2",
				amountOut: "1000",
				usdValue: 500,
				blockTimestamp: "2026-05-22T13:00:00.000Z",
			},
			{
				txHash: "0x2",
				trader: "0xc9846a8390000000000000000000000000000000",
				traderRole: "agent-hot",
				tokenAddress: "0xeth",
				tokenSymbol: "ETH",
				side: "sell",
				amountIn: "0.5",
				amountOut: "1800",
				blockTimestamp: "2026-05-22T13:01:00.000Z",
			},
			{
				txHash: "0x3",
				trader: "0x440e903000000000000000000000000000000000",
				traderRole: "agent-safe",
				tokenAddress: "0xwaifu",
				tokenSymbol: "WAIFU",
				side: "buy",
				amountIn: "0.3",
				amountOut: "250",
				blockTimestamp: "2026-05-22T13:02:00.000Z",
			},
		]);

		const trades = await fetchAgentOwnTrades(ADDRESS);
		expect(trades).toHaveLength(3);
		expect(trades.map((trade) => trade.tokenSymbol)).toEqual(["WAIFU", "ETH", "WAIFU"]);

		const rows = mergeActivityWithTrades({ activity: [], trades, ticker: "WAIFU" });
		expect(rows).toHaveLength(3);
		expect(rows.map((row) => (row.type === "trade" ? row.asset : ""))).toEqual(["WAIFU", "ETH", "WAIFU"]);
	});

	it("returns an honest empty list for an empty endpoint response", async () => {
		mockFetch(200, []);

		const trades = await fetchAgentOwnTrades(ADDRESS);
		expect(trades).toEqual([]);

		const rows = mergeActivityWithTrades({ activity: [], trades, ticker: "WAIFU" });
		expect(rows).toEqual([]);
		expect(EMPTY_ACTIVITY_COPY).toBe("no activity yet · Sol hasn't traded or posted yet");
	});

	it("falls back to empty when the backend 404s", async () => {
		mockFetch(404, { ok: false, error: "AGENT_NOT_FOUND" });
		await expect(fetchAgentOwnTrades(ADDRESS)).resolves.toEqual([]);
	});
});
