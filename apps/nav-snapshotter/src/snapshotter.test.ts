import assert from "node:assert/strict";
import test from "node:test";

import type { NavSnapshot } from "../../api/src/services/nav/types.js";
import { type SnapshotSource, hourStart, runNavSnapshotter } from "./snapshotter.js";

const AGENT = "0x1111111111111111111111111111111111111111";

function navSnapshot(agentTokenAddress = AGENT): NavSnapshot {
	return {
		agentTokenAddress,
		generatedAt: 1_799_999_000,
		navUsd: 123.45,
		unpriced: { count: 1, assets: ["MYSTERY"] },
		byChain: { bsc: 100, solana: 23.45 },
		byWallet: { safe: 100, hot: 23.45 },
		byRole: { "agent-safe": 100, "agent-hot": 23.45 },
		holdings: [
			{
				walletId: "safe",
				walletAddress: "0x2222222222222222222222222222222222222222",
				walletLabel: "Safe",
				walletRole: "agent-safe",
				chain: "bsc",
				asset: "BNB",
				contract: null,
				balance: 1,
				priceUsd: 100,
				valueUsd: 100,
				priced: true,
			},
			{
				walletId: "hot",
				walletAddress: "So11111111111111111111111111111111111111112",
				walletLabel: "Hot",
				walletRole: "agent-hot",
				chain: "solana",
				asset: "MYSTERY",
				contract: null,
				balance: 5,
				priceUsd: null,
				valueUsd: null,
				priced: false,
			},
		],
		stale: [],
	};
}

test("runNavSnapshotter builds and inserts a NAV row with expected fields", async () => {
	const inserted: Array<{ snapshot: NavSnapshot; at: Date; source: SnapshotSource }> = [];
	const at = new Date("2026-05-22T13:15:00.000Z");
	const result = await runNavSnapshotter({
		db: {} as never,
		now: () => at,
		listActiveAgents: async () => [AGENT],
		buildSnapshot: async (address) => navSnapshot(address),
		insertSnapshot: async (snapshot, snapshotAt, source) => {
			inserted.push({ snapshot, at: snapshotAt, source });
			return true;
		},
	});

	assert.equal(result.insertedCount, 1);
	assert.equal(result.skippedCount, 0);
	assert.equal(inserted[0]?.snapshot.navUsd, 123.45);
	assert.deepEqual(inserted[0]?.snapshot.byChain, { bsc: 100, solana: 23.45 });
	assert.deepEqual(inserted[0]?.snapshot.byRole, { "agent-safe": 100, "agent-hot": 23.45 });
	assert.equal(inserted[0]?.source, "scheduled");
	assert.equal(inserted[0]?.at.toISOString(), at.toISOString());
});

test("runNavSnapshotter is idempotent for an agent within the same hour", async () => {
	const seen = new Set<string>();
	const at = new Date("2026-05-22T13:15:00.000Z");
	const deps = {
		db: {} as never,
		now: () => at,
		listActiveAgents: async () => [AGENT],
		buildSnapshot: async (address: string) => navSnapshot(address),
		insertSnapshot: async (snapshot: NavSnapshot, snapshotAt: Date) => {
			const key = `${snapshot.agentTokenAddress}:${hourStart(snapshotAt).toISOString()}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		},
	};

	const first = await runNavSnapshotter(deps);
	const second = await runNavSnapshotter(deps);

	assert.equal(first.insertedCount, 1);
	assert.equal(second.insertedCount, 0);
	assert.equal(second.skippedCount, 1);
	assert.equal(seen.size, 1);
});
