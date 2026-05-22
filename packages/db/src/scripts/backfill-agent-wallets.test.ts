import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "../client.js";
import { backfillAgentWallets } from "./backfill-agent-wallets.js";

const taxSplitterPatron = "0xdc78E5230d5e55B98a199919109F126752c22EDE";
const taxSplitterPlatform = "0x1111111111111111111111111111111111111111";
const taxSplitterAgent = "0x2222222222222222222222222222222222222222";

function createMockDb(launches: Record<string, unknown>[]) {
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

	return { db, rows };
}

test("backfillAgentWallets reads TaxSplitter patron instead of launch creator", async () => {
	const launches = [
		{
			tokenAddress: "0x15fc00000000000000000000000000000000WA1F",
			agentSafeAddress: "0x440E903000000000000000000000000000000000",
			creator: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
			taxSplitterAddress: "0x550E903000000000000000000000000000000000",
			metadata: { ticker: "WAIFU" },
		},
	];
	const { db, rows } = createMockDb(launches);
	const calls: string[] = [];
	const taxSplitterClient = {
		async readContract(args: { functionName: "patron" | "platform" | "agent" }) {
			calls.push(args.functionName);
			if (args.functionName === "patron") return taxSplitterPatron;
			if (args.functionName === "platform") return taxSplitterPlatform;
			return taxSplitterAgent;
		},
	};

	const first = await backfillAgentWallets(db, { taxSplitterClient });
	const second = await backfillAgentWallets(db, { taxSplitterClient });

	assert.deepEqual(first, { launchesProcessed: 1, candidates: 4, inserted: 4, skipped: 0 });
	assert.deepEqual(second, { launchesProcessed: 1, candidates: 4, inserted: 0, skipped: 4 });
	assert.deepEqual(calls.sort(), ["agent", "agent", "patron", "patron", "platform", "platform"]);
	assert.equal(rows.size, 4);
	assert.deepEqual(
		[...rows.values()].map((row) => [row.role, row.address, row.ownerType, row.venue, row.label]),
		[
			["agent-safe", "0x440e903000000000000000000000000000000000", "agent", null, "agent-safe (waifu)"],
			["patron", "0xdc78e5230d5e55b98a199919109f126752c22ede", "patron", null, "patron (waifu)"],
			["venue-bridge", "0x550e903000000000000000000000000000000000", "agent", "taxsplitter", "tax-splitter (waifu)"],
			["agent-hot", "0xc9846a839c4e1d9050dc890a25661ab13224e9ec", "agent", null, "sol-hot-bsc"],
		],
	);
});

test("backfillAgentWallets falls back to launch creator when TaxSplitter read fails", async () => {
	const launches = [
		{
			tokenAddress: "0x15fc00000000000000000000000000000000BEEF",
			agentSafeAddress: null,
			creator: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
			taxSplitterAddress: "0x550E903000000000000000000000000000000000",
			metadata: { ticker: "BEEF" },
		},
	];
	const { db, rows } = createMockDb(launches);
	const warn = console.warn;
	console.warn = () => undefined;
	try {
		const result = await backfillAgentWallets(db, {
			taxSplitterClient: {
				async readContract() {
					throw new Error("rpc unavailable");
				},
			},
		});

		assert.deepEqual(result, { launchesProcessed: 1, candidates: 2, inserted: 2, skipped: 0 });
		assert.deepEqual(
			[...rows.values()].map((row) => [row.role, row.address]),
			[
				["patron", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
				["venue-bridge", "0x550e903000000000000000000000000000000000"],
			],
		);
	} finally {
		console.warn = warn;
	}
});
