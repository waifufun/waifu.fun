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

async function runRollup(events: Array<{ data: Record<string, unknown> }>) {
	const processor = createAgentRollupProcessor({
		db: createDb(events),
		logger: { info() {}, error() {}, warn() {}, debug() {} },
		startedAt: new Date("2026-05-30T00:00:00Z"),
		chainId: 56,
	} as never);

	const payload: AgentRollupJob = { reason: "test", limit: 10 };
	return processor({ id: "job-rollup-1", data: payload } as never);
}

test("agent-rollup reports zero burn when no measured spend exists", async () => {
	const result = await runRollup([]);

	assert.deepEqual(result, { status: "completed", updated: 1, reason: "test" });
	assert.equal(await metricValue("agent_treasury_usd", "agent-no-spend"), 120);
	assert.equal(await metricValue("agent_daily_burn_usd", "agent-no-spend"), 0);
	assert.equal(await metricValue("agent_runway_days", "agent-no-spend"), Number.POSITIVE_INFINITY);
});

test("agent-rollup derives runway from measured inference spend", async () => {
	await runRollup([{ data: { amountCents: 2500 } }]);

	assert.equal(await metricValue("agent_daily_burn_usd", "agent-no-spend"), 25);
	assert.equal(await metricValue("agent_runway_days", "agent-no-spend"), 4.8);
});

test("agent-rollup sums mixed measured spend fields", async () => {
	await runRollup([{ data: { usd: 1.25 } }, { data: { costUsd: "2.5" } }, { data: { amountCents: "325" } }]);

	assert.equal(await metricValue("agent_daily_burn_usd", "agent-no-spend"), 7);
	assert.equal(await metricValue("agent_runway_days", "agent-no-spend"), 120 / 7);
});

test("agent-rollup ignores invalid and negative spend payloads", async () => {
	await runRollup([
		{ data: { amountUsd: -5 } },
		{ data: { amountCents: -500 } },
		{ data: { costUsd: "not-a-number" } },
		{ data: { usd: Number.POSITIVE_INFINITY } },
		{ data: {} },
	]);

	assert.equal(await metricValue("agent_daily_burn_usd", "agent-no-spend"), 0);
	assert.equal(await metricValue("agent_runway_days", "agent-no-spend"), Number.POSITIVE_INFINITY);
});
