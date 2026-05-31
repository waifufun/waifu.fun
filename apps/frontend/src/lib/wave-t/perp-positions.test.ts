import { describe, expect, it } from "vitest";

import {
	type AgentHoldingsSnapshot,
	type AgentPerpPosition,
	holdingsRowsOf,
	perpPositionsFromSnapshot,
} from "@/lib/wave-t/agent-holdings";

function snapshot(perps: Partial<AgentPerpPosition>[]): AgentHoldingsSnapshot {
	return {
		agentTokenAddress: "0xagent",
		generatedAt: Date.now(),
		navUsd: 0,
		unpriced: { count: 0, assets: [] },
		byChain: {},
		byWallet: {},
		byRole: {},
		holdings: [],
		stale: [],
		perpsPositions: perps as AgentPerpPosition[],
	};
}

describe("perpPositionsFromSnapshot", () => {
	it("maps a hyperliquid perp position from the /holdings snapshot shape", () => {
		const out = perpPositionsFromSnapshot(
			snapshot([
				{
					venue: "hyperliquid",
					asset: "BTC",
					side: "long",
					size: "0.04842",
					entryPrice: "74356.0",
					markPrice: "73555",
					notionalUsd: "3561.5331",
					leverage: 20,
					unrealizedPnlUsd: "-38.78829",
					liquidationPrice: "993.5508812657",
				},
			]),
		);
		expect(out).toHaveLength(1);
		const [p] = out;
		expect(p?.coin).toBe("BTC");
		expect(p?.side).toBe("long");
		expect(p?.size).toBeCloseTo(0.04842);
		expect(p?.entryPrice).toBeCloseTo(74356);
		expect(p?.currentPrice).toBeCloseTo(73555);
		expect(p?.leverage).toBe(20);
		expect(p?.notionalUsd).toBeCloseTo(3561.5331);
		expect(p?.unrealizedPnlUsd).toBeCloseTo(-38.78829);
		// margin = notional / leverage = ~178.08; roe = pnl / margin * 100
		expect(p?.marginUsd).toBeCloseTo(3561.5331 / 20);
		expect(p?.unrealizedPnlPct).toBeCloseTo((-38.78829 / (3561.5331 / 20)) * 100);
	});

	it("returns an honest empty array when no perps are present", () => {
		expect(perpPositionsFromSnapshot(snapshot([]))).toEqual([]);
		expect(perpPositionsFromSnapshot(null)).toEqual([]);
		expect(perpPositionsFromSnapshot(undefined)).toEqual([]);
	});

	it("derives null pnl% when leverage is missing (no fake precision)", () => {
		const [p] = perpPositionsFromSnapshot(
			snapshot([
				{ venue: "hyperliquid", asset: "ETH", side: "short", size: "1", notionalUsd: "0", unrealizedPnlUsd: "5" },
			]),
		);
		expect(p?.side).toBe("short");
		expect(p?.unrealizedPnlPct).toBeNull();
	});
});

describe("holdingsRowsOf", () => {
	it("reads tokenHoldings when the legacy holdings array is absent", () => {
		const snap = {
			agentTokenAddress: "0xa",
			generatedAt: 0,
			navUsd: 0,
			unpriced: { count: 0, assets: [] },
			byChain: {},
			byWallet: {},
			byRole: {},
			tokenHoldings: [{ walletId: "w", chain: "bsc", asset: "BNB", balance: 1, valueUsd: 600 }],
		} as unknown as AgentHoldingsSnapshot;
		expect(holdingsRowsOf(snap)).toHaveLength(1);
	});

	it("never iterates undefined", () => {
		expect(holdingsRowsOf({} as AgentHoldingsSnapshot)).toEqual([]);
		expect(holdingsRowsOf(null)).toEqual([]);
	});
});
