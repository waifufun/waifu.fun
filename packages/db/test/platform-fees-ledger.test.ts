import assert from "node:assert/strict";
import test from "node:test";

import { getTotalFeesAcrossPlatform, insertFeeRecord } from "../src/queries/platform-fees-ledger.js";

test("insertFeeRecord inserts and returns platform fee ledger row", async () => {
	const values: unknown[] = [];
	const row = {
		id: "fee-1",
		agentId: "agent-1",
		txHash: "0xtx",
		amountWei: "1000",
		tokenAddress: "0xtoken",
		chain: "bsc",
		source: "curve-trade",
	};
	const db = {
		insert() {
			return {
				values(input: unknown) {
					values.push(input);
					return { returning: async () => [row] };
				},
			};
		},
	} as never;

	const result = await insertFeeRecord(db, row);

	assert.equal(result, row);
	assert.equal((values[0] as { amountWei: string }).amountWei, "1000");
});

test("getTotalFeesAcrossPlatform returns zero when no rows are present", async () => {
	const db = {
		select() {
			return { from: async () => [] };
		},
	} as never;

	assert.equal(await getTotalFeesAcrossPlatform(db), "0");
});
