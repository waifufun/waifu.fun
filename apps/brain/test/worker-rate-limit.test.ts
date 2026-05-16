import assert from "node:assert/strict";
import test from "node:test";

import type { AgentEventRow, AgentPersonaRow } from "@waifufun/db";

import { processEvent } from "../src/worker.js";

test("processEvent marks normal rate-limit cooldowns as skipped, not failed", async () => {
	const event = agentEvent();
	const persona = { agentId: "agent-1" } as AgentPersonaRow;
	const calls: Array<{ method: string; reason?: string }> = [];

	const eventQueries = {
		markDone: async () => {
			calls.push({ method: "markDone" });
			return event;
		},
		markFailed: async (_db: unknown, _id: string, reason: string) => {
			calls.push({ method: "markFailed", reason });
			return event;
		},
		markSkipped: async (_db: unknown, _id: string, reason: string) => {
			calls.push({ method: "markSkipped", reason });
			return { ...event, status: "skipped", errorMessage: reason };
		},
	};
	const personaQueries = {
		getAgentPersonaByAgentId: async () => persona,
		getAgentPersonaByTokenAddress: async () => null,
	};
	const rateLimitStore = new Map([["agent-1", 1_000]]);

	await processEvent({} as never, event, fakeContext(), 5_000, {
		eventQueries,
		personaQueries,
		rateLimitStore,
		nowMs: () => 2_000,
	});

	assert.deepEqual(calls, [{ method: "markSkipped", reason: "rate-limited (cooldown 4s)" }]);
});

function agentEvent(): AgentEventRow {
	return {
		id: "event-1",
		agentId: "agent-1",
		eventType: "token.created",
		data: {},
		txHash: null,
		blockNumber: null,
		chainId: null,
		tokenAddress: "0x1234",
		type: "agent.created",
		payload: {},
		status: "processing",
		attempts: 1,
		errorMessage: null,
		createdAt: new Date("2026-05-01T00:00:00Z"),
		processedAt: null,
	};
}

function fakeContext(): Parameters<typeof processEvent>[2] {
	const logger = {
		info: () => undefined,
		warn: () => undefined,
		error: () => undefined,
		debug: () => undefined,
		trace: () => undefined,
		fatal: () => undefined,
		level: "silent",
	} as Parameters<typeof processEvent>[2]["logger"];

	return {
		logger,
		twitter: { dryRun: true } as Parameters<typeof processEvent>[2]["twitter"],
		anthropicApiKey: undefined,
	};
}
