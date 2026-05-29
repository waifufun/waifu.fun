import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@waifufun/db";
import { groupGithubAgentEvents } from "../src/routes/v2/agent-event-groups.js";

const baseTime = Date.parse("2026-05-27T06:00:00.000Z");

function event(
	overrides: Partial<AgentEvent> & { id: string; eventType?: AgentEvent["eventType"]; minutesAgo?: number },
): AgentEvent {
	const eventType = overrides.eventType ?? "commit.pushed";
	const minutesAgo = overrides.minutesAgo ?? 0;
	const payload = overrides.payload ?? { org: "waifufun", repo: "waifu.fun", sha: overrides.id };
	return {
		id: overrides.id,
		agentId: overrides.agentId ?? "sol",
		eventType,
		data: overrides.data ?? {},
		source: overrides.source ?? "test",
		sourceEventId: overrides.sourceEventId ?? overrides.id,
		correlationId: overrides.correlationId ?? null,
		occurredAt: overrides.occurredAt ?? new Date(baseTime - minutesAgo * 60_000),
		visibility: overrides.visibility ?? "public",
		txHash: overrides.txHash ?? null,
		blockNumber: overrides.blockNumber ?? null,
		chainId: overrides.chainId ?? null,
		tokenAddress: overrides.tokenAddress ?? null,
		type: overrides.type ?? eventType,
		payload,
		status: overrides.status ?? "done",
		attempts: overrides.attempts ?? 0,
		errorMessage: overrides.errorMessage ?? null,
		createdAt: overrides.createdAt ?? new Date(baseTime - minutesAgo * 60_000),
		processedAt: overrides.processedAt ?? null,
	};
}

describe("groupGithubAgentEvents", () => {
	test("5 commits within 30min collapse into 1 group of 5", () => {
		const events = [0, 5, 10, 15, 20].map((minutesAgo, index) => event({ id: `commit-${index}`, minutesAgo }));

		const grouped = groupGithubAgentEvents(events);

		expect(grouped).toHaveLength(1);
		expect(grouped[0]?.grouped).toBe(true);
		expect(grouped[0]?.count).toBe(5);
		expect(grouped[0]?.items?.map((item) => item.id)).toEqual([
			"commit-0",
			"commit-1",
			"commit-2",
			"commit-3",
			"commit-4",
		]);
	});

	test("2 commits 31min apart stay as 2 separate events", () => {
		const grouped = groupGithubAgentEvents([
			event({ id: "latest", minutesAgo: 0 }),
			event({ id: "older", minutesAgo: 31 }),
		]);

		expect(grouped).toHaveLength(2);
		expect(grouped.some((item) => item.grouped)).toBe(false);
	});

	test("3 commits + 1 PR open + 2 commits within 30min become 1 commit group of 5 + 1 PR open", () => {
		const grouped = groupGithubAgentEvents([
			event({ id: "commit-0", minutesAgo: 0 }),
			event({ id: "commit-1", minutesAgo: 4 }),
			event({ id: "commit-2", minutesAgo: 8 }),
			event({
				id: "pr-open",
				eventType: "pr.opened" as AgentEvent["eventType"],
				minutesAgo: 10,
				payload: { org: "waifufun", repo: "waifu.fun", number: 12 },
			}),
			event({ id: "commit-3", minutesAgo: 14 }),
			event({ id: "commit-4", minutesAgo: 18 }),
		]);

		expect(grouped).toHaveLength(2);
		expect(grouped[0]?.eventType).toBe("commit.pushed");
		expect(grouped[0]?.count).toBe(5);
		expect(grouped[1]?.eventType).toBe("pr.opened");
	});
});
