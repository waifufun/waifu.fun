import assert from "node:assert/strict";
import test from "node:test";

import { insertAgentSafe, updateSafeRoleConfig } from "../src/queries/agent-safes.js";

test("insertAgentSafe upserts on agent + chain and returns row", async () => {
	const calls: Record<string, unknown>[] = [];
	const row = { id: "safe-1", agentId: "agent-1", chain: "bsc", safeAddress: "0xSafe" };
	const db = {
		insert(table: unknown) {
			calls.push({ op: "insert", table });
			return {
				values(values: unknown) {
					calls.push({ op: "values", values });
					return {
						onConflictDoUpdate(conflict: unknown) {
							calls.push({ op: "conflict", conflict });
							return { returning: async () => [row] };
						},
					};
				},
			};
		},
	} as never;

	const result = await insertAgentSafe(db, {
		agentId: "agent-1",
		chain: "bsc",
		safeAddress: "0xSafe",
		zodiacModifierAddress: "0xRoles",
	});

	assert.equal(result, row);
	assert.deepEqual(calls[1]?.values, {
		agentId: "agent-1",
		chain: "bsc",
		safeAddress: "0xSafe",
		zodiacModifierAddress: "0xRoles",
	});
	assert.equal(calls[2]?.op, "conflict");
});

test("updateSafeRoleConfig writes Zodiac role identifiers", async () => {
	const sets: unknown[] = [];
	const row = { id: "safe-1", agentId: "agent-1", chain: "bsc", agentRoleId: "0xagent" };
	const db = {
		update() {
			return {
				set(values: unknown) {
					sets.push(values);
					return { where: () => ({ returning: async () => [row] }) };
				},
			};
		},
	} as never;

	const result = await updateSafeRoleConfig(db, "agent-1", "bsc", {
		zodiacModifierAddress: "0xRoles",
		agentRoleId: "0xagent",
		patronRoleId: "0xpatron",
	});

	assert.equal(result, row);
	assert.deepEqual(sets[0], {
		zodiacModifierAddress: "0xRoles",
		rolesModifierAddress: "0xRoles",
		agentRoleId: "0xagent",
		patronRoleId: "0xpatron",
	});
});
