import { describe, expect, it } from "vitest";

import type { AgentHoldingsSnapshot } from "./agent-holdings";
import { holdingsSnapshotFromApi } from "./holdings";

function snap(holdings: AgentHoldingsSnapshot["holdings"], navUsd = 0): AgentHoldingsSnapshot {
	return {
		agentTokenAddress: "0xtest",
		generatedAt: 1700000000,
		navUsd,
		unpriced: { count: 0, assets: [] },
		byChain: {},
		byWallet: {},
		byRole: {},
		holdings,
		stale: [],
	};
}

describe("holdingsSnapshotFromApi", () => {
	it("collapses multi-wallet rows into one (chain, asset) row", () => {
		const out = holdingsSnapshotFromApi(
			snap(
				[
					{
						walletId: "w1",
						walletAddress: "0x1",
						walletLabel: "agent safe",
						walletRole: "agent-safe",
						chain: "bsc",
						asset: "BNB",
						contract: null,
						balance: 5,
						priceUsd: 600,
						valueUsd: 3000,
						priced: true,
					},
					{
						walletId: "w2",
						walletAddress: "0x2",
						walletLabel: "agent hot",
						walletRole: "agent-hot",
						chain: "bsc",
						asset: "BNB",
						contract: null,
						balance: 1.5,
						priceUsd: 600,
						valueUsd: 900,
						priced: true,
					},
					{
						walletId: "w3",
						walletAddress: "0x3",
						walletLabel: "patron",
						walletRole: "patron",
						chain: "bsc",
						asset: "BNB",
						contract: null,
						balance: 0.25,
						priceUsd: 600,
						valueUsd: 150,
						priced: true,
					},
				],
				4050,
			),
		);
		expect(out.holdings).toHaveLength(1);
		expect(out.holdings[0]?.asset).toBe("BNB");
		expect(out.holdings[0]?.balance).toBeCloseTo(6.75, 6);
		expect(out.holdings[0]?.valueUsd).toBe(4050);
		// wallet breakdown preserved, sorted desc by usd value
		expect(out.holdings[0]?.wallets).toHaveLength(3);
		expect(out.holdings[0]?.wallets?.[0]?.role).toBe("agent-safe");
		expect(out.holdings[0]?.wallets?.[1]?.role).toBe("agent-hot");
		expect(out.holdings[0]?.wallets?.[2]?.role).toBe("patron");
	});

	it("keeps different contracts on the same chain separate", () => {
		const out = holdingsSnapshotFromApi(
			snap([
				{
					walletId: "w1",
					walletAddress: "0x1",
					walletLabel: "agent safe",
					walletRole: "agent-safe",
					chain: "bsc",
					asset: "USDC",
					contract: "0xAAAA",
					balance: 100,
					priceUsd: 1,
					valueUsd: 100,
					priced: true,
				},
				{
					walletId: "w1",
					walletAddress: "0x1",
					walletLabel: "agent safe",
					walletRole: "agent-safe",
					chain: "bsc",
					asset: "USDC",
					contract: "0xBBBB",
					balance: 200,
					priceUsd: 1,
					valueUsd: 200,
					priced: true,
				},
			]),
		);
		expect(out.holdings).toHaveLength(2);
	});

	it("matches contract addresses case-insensitively", () => {
		const out = holdingsSnapshotFromApi(
			snap([
				{
					walletId: "w1",
					walletAddress: "0x1",
					walletLabel: "agent safe",
					walletRole: "agent-safe",
					chain: "bsc",
					asset: "USDC",
					contract: "0xABcDef",
					balance: 100,
					priceUsd: 1,
					valueUsd: 100,
					priced: true,
				},
				{
					walletId: "w2",
					walletAddress: "0x2",
					walletLabel: "agent hot",
					walletRole: "agent-hot",
					chain: "bsc",
					asset: "USDC",
					contract: "0xabcdef",
					balance: 50,
					priceUsd: 1,
					valueUsd: 50,
					priced: true,
				},
			]),
		);
		expect(out.holdings).toHaveLength(1);
		expect(out.holdings[0]?.balance).toBe(150);
	});

	it("keeps the same asset on different chains as separate rows", () => {
		const out = holdingsSnapshotFromApi(
			snap([
				{
					walletId: "w1",
					walletAddress: "0x1",
					walletLabel: "agent safe",
					walletRole: "agent-safe",
					chain: "ethereum",
					asset: "ETH",
					contract: null,
					balance: 1,
					priceUsd: 3000,
					valueUsd: 3000,
					priced: true,
				},
				{
					walletId: "w1",
					walletAddress: "0x1",
					walletLabel: "agent safe",
					walletRole: "agent-safe",
					chain: "base",
					asset: "ETH",
					contract: null,
					balance: 2,
					priceUsd: 3000,
					valueUsd: 6000,
					priced: true,
				},
			]),
		);
		expect(out.holdings).toHaveLength(2);
	});

	it("skips unpriced holdings", () => {
		const out = holdingsSnapshotFromApi(
			snap([
				{
					walletId: "w1",
					walletAddress: "0x1",
					walletLabel: "agent safe",
					walletRole: "agent-safe",
					chain: "bsc",
					asset: "MYSTERY",
					contract: "0xdeadbeef",
					balance: 1000,
					priceUsd: null,
					valueUsd: null,
					priced: false,
				},
			]),
		);
		expect(out.holdings).toHaveLength(0);
	});
});
