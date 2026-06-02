import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_ERC8004_REPUTATION_REGISTRY, readReputation } from "./erc8004-reputation.js";

const clients = ["0x00000000000000000000000000000000000000a1"] as const;

test("readReputation reads clients then feedback summary", async () => {
	const calls: unknown[] = [];
	const client = {
		async readContract(input: unknown) {
			calls.push(input);
			const { functionName } = input as { functionName: string };
			if (functionName === "getClients") return clients;
			if (functionName === "getSummary") return [2n, 150n, 2] as const;
			throw new Error(`unexpected function: ${functionName}`);
		},
	};

	const summary = await readReputation(42n, { client, tag1: "quality", tag2: "trade" });

	assert.deepEqual(summary, {
		agentId: "42",
		registry: DEFAULT_ERC8004_REPUTATION_REGISTRY,
		clients,
		count: "2",
		summaryValue: "150",
		summaryValueDecimals: 2,
		tag1: "quality",
		tag2: "trade",
	});
	assert.equal(calls.length, 2);
	assert.equal((calls[0] as { functionName: string }).functionName, "getClients");
	assert.deepEqual((calls[1] as { args: unknown[] }).args, [42n, clients, "quality", "trade"]);
});
