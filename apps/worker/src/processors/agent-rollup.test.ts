import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { metricsRegistry } from "@waifufun/metrics";
import type { AgentRollupJob } from "@waifufun/queue/jobs";

import { createAgentRollupProcessor } from "./agent-rollup.js";

type SelectFields = Record<string, unknown>;
type SpendEvent = { agentId: string | null; eventType: string; createdAt: Date; data: Record<string, unknown> };

const OVERLAY_AGENT_ID = "11111111-1111-4111-8111-111111111111";
const INTERNAL_AGENT_ID = "waifu-solmaren-ab12cd34ef56";

afterEach(() => {
	metricsRegistry.resetMetrics();
});

function createDb(events: SpendEvent[]) {
	return {
		listActiveAgents: async (limit?: number) => {
			assert.equal(limit, 10);
			return [
				{
					id: OVERLAY_AGENT_ID,
					internalAgentId: INTERNAL_AGENT_ID,
					name: "Solmaren",
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
						where(condition: unknown) {
							const [agentId, eventType, since] = sqlParamValues(condition);
							assert.equal(eventType, "inference.spent");
							assert.ok(since instanceof Date);
							return Promise.resolve(
								events
									.filter((event) => event.agentId === agentId)
									.filter((event) => event.eventType === eventType)
									.filter((event) => event.createdAt >= since)
									.map(({ data }) => ({ data })),
							);
						},
					};
				},
			};
		},
	};
}

function sqlParamValues(value: unknown): unknown[] {
	if (!value || typeof value !== "object") return [];
	const candidate = value as { constructor?: { name?: string }; value?: unknown; queryChunks?: unknown[] };
	if (candidate.constructor?.name === "Param") return [candidate.value];
	if (Array.isArray(candidate.queryChunks)) return candidate.queryChunks.flatMap(sqlParamValues);
	return [];
}

async function metricValue(name: string, agentId: string): Promise<number | undefined> {
	const metrics = await metricsRegistry.getMetricsAsJSON();
	const metric = metrics.find((entry) => entry.name === name);
	const value = metric?.values.find((entry) => entry.labels.agentId === agentId)?.value;
	return typeof value === "number" ? value : undefined;
}

function spendEvent(data: Record<string, unknown>, overrides: Partial<SpendEvent> = {}): SpendEvent {
	return {
		agentId: INTERNAL_AGENT_ID,
		eventType: "inference.spent",
		createdAt: new Date(),
		data,
		...overrides,
	};
}

async function runRollup(events: SpendEvent[]) {
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
	assert.equal(await metricValue("agent_treasury_usd", OVERLAY_AGENT_ID), 120);
	assert.equal(await metricValue("agent_daily_burn_usd", OVERLAY_AGENT_ID), 0);
	assert.equal(await metricValue("agent_runway_days", OVERLAY_AGENT_ID), Number.POSITIVE_INFINITY);
});

test("agent-rollup derives runway from measured inference spend", async () => {
	await runRollup([spendEvent({ amountCents: 2500 })]);

	assert.equal(await metricValue("agent_daily_burn_usd", OVERLAY_AGENT_ID), 25);
	assert.equal(await metricValue("agent_runway_days", OVERLAY_AGENT_ID), 4.8);
});

test("agent-rollup reads inference spend by internal event agent id", async () => {
	await runRollup([
		spendEvent({ amountCents: 2500 }, { agentId: OVERLAY_AGENT_ID }),
		spendEvent({ amountCents: 5000 }),
	]);

	assert.equal(await metricValue("agent_daily_burn_usd", OVERLAY_AGENT_ID), 50);
	assert.equal(await metricValue("agent_runway_days", OVERLAY_AGENT_ID), 2.4);
});

test("agent-rollup sums mixed measured spend fields", async () => {
	await runRollup([spendEvent({ usd: 1.25 }), spendEvent({ costUsd: "2.5" }), spendEvent({ amountCents: "325" })]);

	assert.equal(await metricValue("agent_daily_burn_usd", OVERLAY_AGENT_ID), 7);
	assert.equal(await metricValue("agent_runway_days", OVERLAY_AGENT_ID), 120 / 7);
});

test("agent-rollup ignores invalid and negative spend payloads", async () => {
	await runRollup([
		spendEvent({ amountUsd: -5 }),
		spendEvent({ amountCents: -500 }),
		spendEvent({ costUsd: "not-a-number" }),
		spendEvent({ usd: Number.POSITIVE_INFINITY }),
		spendEvent({}),
	]);

	assert.equal(await metricValue("agent_daily_burn_usd", OVERLAY_AGENT_ID), 0);
	assert.equal(await metricValue("agent_runway_days", OVERLAY_AGENT_ID), Number.POSITIVE_INFINITY);
});
