import assert from "node:assert/strict";
import test from "node:test";

import { resurrectAgent } from "./agents.js";

test("resurrectAgent tops up credits, clears dormant fields, and emits resurrection", async () => {
	const updates: unknown[] = [];
	const wheres: unknown[] = [];
	const toppedUp: unknown[] = [];
	const emitted: unknown[] = [];
	const db = {
		update(table: unknown) {
			return {
				set(values: unknown) {
					updates.push({ table, values });
					return {
						where(condition: unknown) {
							wheres.push(condition);
							return Promise.resolve();
						},
					};
				},
			};
		},
	} as never;

	const result = await resurrectAgent("waifu-demo-01", 2500, {
		db,
		miladyClient: {
			async topUpCredits(agentId, amount) {
				toppedUp.push({ agentId, amount });
			},
		},
		async emitEvent(input) {
			emitted.push(input);
			return {} as Awaited<ReturnType<NonNullable<Parameters<typeof resurrectAgent>[2]["emitEvent"]>>>;
		},
	});

	assert.deepEqual(result, { agentId: "waifu-demo-01", creditsAmount: 2500, modelTier: "premium" });
	assert.deepEqual(toppedUp, [{ agentId: "waifu-demo-01", amount: 2500 }]);
	assert.equal(updates.length, 1);
	const values = (updates[0] as { values: Record<string, unknown> }).values;
	assert.equal(values.dormantAt, null);
	assert.equal(values.brainPausedAt, null);
	assert.equal(values.lastWordsPostedAt, null);
	assert.equal(values.modelTier, "premium");
	assert.equal(wheres.length, 1);
	assert.equal((emitted[0] as { eventType: string }).eventType, "agent.resurrected");
});
