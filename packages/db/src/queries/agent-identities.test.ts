import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "../client.js";
import { upsertAgentIdentity } from "./agent-identities.js";

function createMockDb() {
	const rows = new Map<string, Record<string, unknown>>();
	const db = {
		insert() {
			let value: Record<string, unknown> = {};
			let updateSet: Record<string, unknown> = {};
			return {
				values(input: Record<string, unknown>) {
					value = input;
					return this;
				},
				onConflictDoUpdate(args: { set: Record<string, unknown> }) {
					updateSet = args.set;
					return this;
				},
				returning() {
					const key = `${value.agentAddress}:${value.standard}:${value.chainId}`;
					const existing = rows.get(key);
					if (existing) {
						const updated = { ...existing, ...updateSet };
						rows.set(key, updated);
						return Promise.resolve([updated]);
					}
					const inserted = { id: `identity-${rows.size + 1}`, ...value };
					rows.set(key, inserted);
					return Promise.resolve([inserted]);
				},
			};
		},
	} as unknown as Database;
	return { db, rows };
}

test("upsertAgentIdentity inserts and updates latest URI", async () => {
	const { db, rows } = createMockDb();
	await upsertAgentIdentity(db, {
		agentAddress: "0x15fc6086064Afe50cCf4c70000C55CECb6E17777",
		standard: "erc-8004",
		chainId: 56,
		registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
		uri: "ipfs://bafyoldcidcidcidcidcidcidcidcidcidcidcidcidcidcid",
		uriIpfs: "ipfs://bafyoldcidcidcidcidcidcidcidcidcidcidcidcidcidcid",
	});
	await upsertAgentIdentity(db, {
		agentAddress: "0x15fc6086064Afe50cCf4c70000C55CECb6E17777",
		standard: "erc-8004",
		chainId: 56,
		registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
		uri: "ipfs://bafynewcidcidcidcidcidcidcidcidcidcidcidcidcidcid",
		uriIpfs: "ipfs://bafynewcidcidcidcidcidcidcidcidcidcidcidcidcidcid",
		agentIdOnchain: "123",
	});

	assert.equal(rows.size, 1);
	const [row] = [...rows.values()];
	assert.equal(row?.uri, "ipfs://bafynewcidcidcidcidcidcidcidcidcidcidcidcidcidcid");
	assert.equal(row?.agentIdOnchain, "123");
});
