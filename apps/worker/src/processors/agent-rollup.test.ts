import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { metricsRegistry } from "@waifufun/metrics";
import type { AgentRollupJob } from "@waifufun/queue/jobs";

import { createAgentRollupProcessor } from "./agent-rollup.js";

type SelectFields = Record<string, unknown>;

afterEach(() => {
	metricsRegistry.resetMetrics();
});

function createDb(events: Array<{ data: Record<string, unknown> }>) {
	return {
		listActiveAgents: async (limit?: number) => {
			assert.equal(limit, 10);
			return [
				{
					id: "agent-no-spend",
					tokenAddress: "0x0000000000000000000000000000000000000001",
					treasuryAddress: "0x0000000000000000000000000000000000000002",
					cachedBalance: "120",
				},
			];
		},
		select(_fields: SelectFields) {
			return {
				from() {
					return {
						where() {
							return Promise.resolve(events);
						},
					};
				},
			};
		},
	};
}

async function metricValue(name: string, agentId: string): Promise<number | undefined> {
	const metrics = await metricsRegistry.getMetricsAsJSON();
	const metric = metrics.find((entry) => entry.name === name);
	const value = metric?.values.find((entry) => entry.labels.agentId === agentId)?.value;
	return typeof value === "number" ? value : undefined;
}

test("agent-rollup reports zero burn when no measured spend exists", async () => {
	metricsRegistry.resetMetrics();
	const processor = createAgentRollupProcessor({
		db: createDb([]),
		logger: { info() {}, error() {}, warn() {}, debug() {} },
		startedAt: new Date("2026-05-30T00:00:00Z"),
		chainId: 56,
	} as never);

	const payload: AgentRollupJob = { reason: "test", limit: 10 };
	const result = await processor({ id: "job-rollup-1", data: payload } as never);

	assert.deepEqual(result, { status: "completed", updated: 1, reason: "test" });
	assert.equal(await metricValue("agent_treasury_usd", "agent-no-spend"), 120);
	assert.equal(await metricValue("agent_daily_burn_usd", "agent-no-spend"), 0);
	assert.equal(await metricValue("agent_runway_days", "agent-no-spend"), Number.POSITIVE_INFINITY);
});

test("agent-rollup derives runway from measured inference spend", async () => {
	metricsRegistry.resetMetrics();
	const processor = createAgentRollupProcessor({
		db: createDb([{ data: { amountCents: 2500 } }]),
		logger: { info() {}, error() {}, warn() {}, debug() {} },
		startedAt: new Date("2026-05-30T00:00:00Z"),
		chainId: 56,
	} as never);

	const payload: AgentRollupJob = { reason: "test", limit: 10 };
	await processor({ id: "job-rollup-2", data: payload } as never);

	assert.equal(await metricValue("agent_daily_burn_usd", "agent-no-spend"), 25);
	assert.equal(await metricValue("agent_runway_days", "agent-no-spend"), 4.8);
});
