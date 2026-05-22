import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "../client.js";
import { backfillAgentWallets } from "./backfill-agent-wallets.js";

test("backfillAgentWallets is idempotent and inserts the four WAIFU wallets once", async () => {
	const launches = [
		{
			tokenAddress: "0x15fc00000000000000000000000000000000WA1F",
			agentSafeAddress: "0x440E903000000000000000000000000000000000",
			creator: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
			taxSplitterAddress: "0x550E903000000000000000000000000000000000",
			metadata: { ticker: "WAIFU" },
		},
	];
	const rows = new Map<string, Record<string, unknown>>();
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return Promise.resolve(launches);
						},
					};
				},
			};
		},
		insert() {
			let value: Record<string, unknown> = {};
			return {
				values(input: Record<string, unknown>) {
					value = input;
					return this;
				},
				onConflictDoNothing() {
					return this;
				},
				returning() {
					const key = `${value.agentTokenAddress}:${value.address}:${value.chain}`;
					if (rows.has(key)) return Promise.resolve([]);
					const stored = { id: `wallet-${rows.size + 1}`, ...value };
					rows.set(key, stored);
					return Promise.resolve([{ id: stored.id }]);
				},
			};
		},
	} as unknown as Database;

	const first = await backfillAgentWallets(db);
	const second = await backfillAgentWallets(db);

	assert.deepEqual(first, { launchesProcessed: 1, candidates: 4, inserted: 4, skipped: 0 });
	assert.deepEqual(second, { launchesProcessed: 1, candidates: 4, inserted: 0, skipped: 4 });
	assert.equal(rows.size, 4);
	assert.deepEqual(
		[...rows.values()].map((row) => [row.role, row.address, row.ownerType, row.venue, row.label]),
		[
			["agent-safe", "0x440e903000000000000000000000000000000000", "agent", null, "agent-safe (waifu)"],
			["patron", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "patron", null, "patron (waifu)"],
			["venue-bridge", "0x550e903000000000000000000000000000000000", "agent", "taxsplitter", "tax-splitter (waifu)"],
			["agent-hot", "0xc9846a839c4e1d9050dc890a25661ab13224e9ec", "agent", null, "sol-hot-bsc"],
		],
	);
});
