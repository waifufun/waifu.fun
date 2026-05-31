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

	it("carries the BNB leg (wei) through to the trade row priceBnb for a real pancakeswap buy", async () => {
		// Ground-truth tx 0x692330...c803b35: 0.1 BNB in -> ~26,301 WAIFU out
		// on the graduated V2 pair (token0=WAIFU, token1=WBNB). The indexer
		// already wrote amountIn as the WBNB leg, so the feed must show ~0.1
		// bnb, not 0.000000.
		mockFetch(200, [
			{
				txHash: "0x692330baa898637760085f546dec1013b0fca3c38c3abd4ce732fdfd9c803b35",
				trader: "0xc9846a839c4e1d9050dc890a25661ab13224e9ec",
				traderRole: "agent-hot",
				tokenAddress: "0x15fc6086064afe50ccf4c70000c55cecb6e17777",
				tokenSymbol: "WAIFU",
				side: "buy",
				amountIn: "100000000000000000",
				amountOut: "26301257092316698233859",
				blockTimestamp: "2026-05-31T09:23:05.000Z",
			},
		]);

		const trades = await fetchAgentOwnTrades(ADDRESS);
		expect(trades).toHaveLength(1);
		const [t] = trades;
		expect(t?.type).toBe("buy");
		expect(t?.bnbValue).toBeCloseTo(0.1, 9);
		expect(Number(t?.amount)).toBeCloseTo(26301.25709, 2);

		const rows = mergeActivityWithTrades({ activity: [], trades, ticker: "WAIFU" });
		expect(rows).toHaveLength(1);
		const [row] = rows;
		if (row?.type !== "trade") throw new Error("expected a trade row");
		expect(row.priceBnb).toBeCloseTo(0.1, 9);
		expect(row.venue).toBe("PancakeSwap");
	});

	it("uses the WBNB-out leg for a sell so priceBnb shows BNB received", async () => {
		mockFetch(200, [
			{
				txHash: "0xsell",
				trader: "0xc9846a839c4e1d9050dc890a25661ab13224e9ec",
				traderRole: "agent-hot",
				tokenAddress: "0x15fc6086064afe50ccf4c70000c55cecb6e17777",
				tokenSymbol: "WAIFU",
				side: "sell",
				amountIn: "26301257092316698233859",
				amountOut: "95000000000000000",
				blockTimestamp: "2026-05-31T09:30:00.000Z",
			},
		]);

		const trades = await fetchAgentOwnTrades(ADDRESS);
		const [t] = trades;
		expect(t?.type).toBe("sell");
		expect(t?.bnbValue).toBeCloseTo(0.095, 9);
		expect(Number(t?.amount)).toBeCloseTo(26301.25709, 2);
	});

	it("returns an honest empty list for an empty endpoint response", async () => {
		mockFetch(200, []);

		const trades = await fetchAgentOwnTrades(ADDRESS);
		expect(trades).toEqual([]);

		const rows = mergeActivityWithTrades({ activity: [], trades, ticker: "WAIFU" });
		expect(rows).toEqual([]);
		expect(EMPTY_ACTIVITY_COPY).toMatch(/no activity yet/);
		expect(EMPTY_ACTIVITY_COPY).toMatch(/onchain feed quiet/);
	});

	it("parses the hyperliquid /activity-trades shape (no txHash, asset+size+price)", async () => {
		mockFetch(200, {
			trades: [
				{
					id: "hl:445800059452:739205643264533",
					venue: "hyperliquid",
					orderId: "445800059452",
					asset: "ZEC",
					side: "buy",
					size: "1.87",
					price: "536.02",
					notionalUsd: "1002.3574",
					timestamp: "2026-05-28T04:39:23.664Z",
				},
			],
		});

		const trades = await fetchAgentOwnTrades(ADDRESS);
		expect(trades).toHaveLength(1);
		const [t] = trades;
		expect(t?.tokenSymbol).toBe("ZEC");
		expect(t?.type).toBe("buy");
		expect(t?.amount).toBeCloseTo(1.87);
		expect(t?.usdValue).toBeCloseTo(1002.3574);
		expect(Number.isFinite(t?.timestamp)).toBe(true);
		// HL fills must be tagged hyperliquid so the feed skips the bscscan path.
		expect(t?.venue).toBe("hyperliquid");
	});

	it("renders HL fills with the hyperliquid venue and no bscscan link", async () => {
		mockFetch(200, {
			trades: [
				{
					id: "hl:445800059452:739205643264533",
					venue: "hyperliquid",
					asset: "ZEC",
					side: "buy",
					size: "1.87",
					price: "536.02",
					notionalUsd: "1002.3574",
					timestamp: "2026-05-28T04:39:23.664Z",
				},
			],
		});

		const trades = await fetchAgentOwnTrades(ADDRESS);
		const rows = mergeActivityWithTrades({ activity: [], trades, ticker: "WAIFU" });
		expect(rows).toHaveLength(1);
		const [row] = rows;
		if (row?.type !== "trade") throw new Error("expected a trade row");
		expect(row.venue).toBe("Hyperliquid");
		// no bogus bscscan tx link for an HL fill id (it is not an on-chain tx).
		expect((row as { url?: string }).url).toBeUndefined();
	});

	it("falls back to empty when the backend 404s", async () => {
		mockFetch(404, { ok: false, error: "AGENT_NOT_FOUND" });
		await expect(fetchAgentOwnTrades(ADDRESS)).resolves.toEqual([]);
	});
});
