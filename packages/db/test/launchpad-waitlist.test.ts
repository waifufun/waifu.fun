import assert from "node:assert/strict";
import test from "node:test";

import { addToWaitlist, getWaitlistCount } from "../src/queries/launchpad-waitlist.js";

test("addToWaitlist normalizes email and returns inserted row", async () => {
	const values: unknown[] = [];
	const row = {
		id: "wait-1",
		email: "test@example.com",
		launchpadId: "pump-fun",
	};
	const db = {
		insert() {
			return {
				values(input: unknown) {
					values.push(input);
					return {
						onConflictDoNothing() {
							return { returning: async () => [row] };
						},
					};
				},
			};
		},
	} as never;

	const result = await addToWaitlist(db, { email: " Test@Example.com ", launchpadId: "pump-fun" });

	assert.equal(result, row);
	assert.deepEqual(values[0], { email: "test@example.com", launchpadId: "pump-fun" });
});

test("getWaitlistCount returns count from query", async () => {
	const db = {
		select() {
			return { from: () => ({ where: async () => [{ count: 7 }] }) };
		},
	} as never;

	assert.equal(await getWaitlistCount(db, "bags"), 7);
});
