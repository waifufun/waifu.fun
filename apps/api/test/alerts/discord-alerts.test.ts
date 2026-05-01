import assert from "node:assert/strict";
import { mock, test } from "node:test";

import type { AgentEvent } from "@waifufun/db";

import { dispatchAgentEventAlert } from "../../src/services/alerts/event-consumer.js";

const EXPECTED_ALERTS: Array<{
	eventType: AgentEvent["eventType"];
	title: string;
	color: number;
	data?: Record<string, unknown>;
}> = [
	{
		eventType: "agent.provisioning_dead_letter",
		title: "Agent failed to provision after 3 attempts",
		color: 0xef4444,
		data: { error: "create failed" },
	},
	{ eventType: "agent.killed", title: "Agent killed", color: 0xef4444, data: { reason: "manual" } },
	{
		eventType: "agent.kill_activated",
		title: "Agent kill switch activated",
		color: 0xfacc15,
		data: { reason: "policy" },
	},
	{
		eventType: "agent.dormant",
		title: "Agent dormant",
		color: 0xfacc15,
		data: { creditsTopUpCount: 3 },
	},
	{ eventType: "agent.resurrected", title: "Agent resurrected", color: 0x22c55e },
	{ eventType: "agent.credits.depleted", title: "Agent credits depleted", color: 0xfacc15 },
	{ eventType: "tax.split.configured", title: "Tax split configured", color: 0x22c55e },
];

test("Discord alert integration emits an embed for each alerting event", async (t) => {
	const oldWebhook = process.env.DISCORD_OPS_WEBHOOK_URL;
	const oldFrontend = process.env.WAIFU_FRONTEND_URL;
	process.env.DISCORD_OPS_WEBHOOK_URL = "https://discord.test/webhook";
	process.env.WAIFU_FRONTEND_URL = "https://waifu.fun";
	t.after(() => {
		process.env.DISCORD_OPS_WEBHOOK_URL = oldWebhook;
		process.env.WAIFU_FRONTEND_URL = oldFrontend;
		mock.restoreAll();
	});

	const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));

	for (const expected of EXPECTED_ALERTS) {
		await dispatchAgentEventAlert(agentEvent(expected.eventType, expected.data ?? {}));
	}

	assert.equal(fetchMock.mock.callCount(), EXPECTED_ALERTS.length);

	for (const [index, expected] of EXPECTED_ALERTS.entries()) {
		const call = fetchMock.mock.calls[index];
		assert.ok(call);
		const [url, init] = call.arguments as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		assert.equal(url, "https://discord.test/webhook");
		assert.equal(init.method, "POST");
		assert.equal(headers["content-type"], "application/json");

		const body = JSON.parse(String(init.body));
		assert.equal(body.embeds.length, 1);

		const embed = body.embeds[0];
		assert.equal(embed.title, expected.title);
		assert.equal(embed.color, expected.color);
		assert.ok(Date.parse(embed.timestamp));

		assert.deepEqual(embed.fields.slice(0, 2), [
			{ name: "agentId", value: "[waifu-demo-01](https://waifu.fun/agent/waifu-demo-01)" },
			{ name: "event", value: expected.eventType },
		]);

		if (expected.eventType === "agent.dormant") {
			assert.deepEqual(embed.fields[2], { name: "creditsTopUpCount", value: "3" });
		}
	}
});

function agentEvent(eventType: AgentEvent["eventType"], data: Record<string, unknown>): AgentEvent {
	return {
		id: "4efc9f5f-7d73-447d-9f0f-d842c8b75000",
		agentId: "waifu-demo-01",
		eventType,
		data,
		txHash: null,
		blockNumber: null,
		chainId: null,
		tokenAddress: null,
		type: eventType,
		payload: data,
		status: "done",
		attempts: 0,
		errorMessage: null,
		createdAt: new Date("2026-04-24T10:00:00.000Z"),
		processedAt: null,
	};
}
