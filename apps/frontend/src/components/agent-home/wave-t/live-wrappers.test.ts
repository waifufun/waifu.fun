import { describe, expect, it } from "vitest";

import type { AgentEvent } from "@/lib/hooks/use-agent-events";
import { filterAgentEventsForActivity, isFundingNoiseEvent } from "./activity-event-filter";

function event(id: string, eventType: string): AgentEvent {
	return {
		id,
		agentId: "agent-1",
		eventType,
		data: {},
		payload: {},
		txHash: null,
		blockNumber: null,
		chainId: null,
		tokenAddress: "0xagent",
		type: eventType,
		status: "confirmed",
		createdAt: "2026-06-16T17:00:00.000Z",
	};
}

describe("agent activity funding-noise filter", () => {
	it("identifies hl_funding and funding variants as hidden feed noise", () => {
		expect(isFundingNoiseEvent({ eventType: "hl_funding" })).toBe(true);
		expect(isFundingNoiseEvent({ eventType: "funding" })).toBe(true);
		expect(isFundingNoiseEvent({ eventType: "HL.FUNDING" })).toBe(true);
		expect(isFundingNoiseEvent({ eventType: "trade.fill" })).toBe(false);
		expect(isFundingNoiseEvent({ eventType: "trade.open" })).toBe(false);
		expect(isFundingNoiseEvent({ eventType: "pr.merged" })).toBe(false);
		expect(isFundingNoiseEvent({ eventType: "commit.pushed" })).toBe(false);
	});

	it("excludes funding events before feed rows and counts are built", () => {
		const events = [
			event("1", "hl_funding"),
			event("2", "trade.fill"),
			event("3", "trade.open"),
			event("4", "funding"),
			event("5", "pr.merged"),
		];

		expect(filterAgentEventsForActivity(events).map((e) => e.eventType)).toEqual([
			"trade.fill",
			"trade.open",
			"pr.merged",
		]);
	});
});
