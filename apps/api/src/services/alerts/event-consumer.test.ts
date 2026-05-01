import assert from "node:assert/strict";
import { mock, test } from "node:test";

import type { AgentEvent } from "@waifufun/db";

import { buildAgentEventAlert, dispatchAgentEventAlert } from "./event-consumer.js";

test("buildAgentEventAlert maps alert event severities", () => {
	assert.equal(buildAgentEventAlert(agentEvent("agent.killed"))?.severity, "crit");
	assert.equal(buildAgentEventAlert(agentEvent("agent.kill_activated"))?.severity, "warn");
	assert.equal(buildAgentEventAlert(agentEvent("agent.resurrected"))?.severity, "info");
	assert.equal(buildAgentEventAlert(agentEvent("agent.claimed"))?.severity, undefined);
});

test("dispatchAgentEventAlert sends Discord webhook with agent and custom fields", async (t) => {
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

	await dispatchAgentEventAlert(agentEvent("agent.dormant", { creditsTopUpCount: 2 }, "waifu-demo-01"));

	assert.equal(fetchMock.mock.callCount(), 1);
	const call = fetchMock.mock.calls[0];
	assert.ok(call);
	const [url, init] = call.arguments as [string, RequestInit];
	assert.equal(url, "https://discord.test/webhook");
	assert.equal(init.method, "POST");

	const body = JSON.parse(String(init.body));
	const embed = body.embeds[0];
	assert.equal(embed.title, "Agent dormant");
	assert.equal(embed.color, 0xfacc15);
	assert.ok(Date.parse(embed.timestamp));
	assert.deepEqual(embed.fields, [
		{ name: "agentId", value: "[waifu-demo-01](https://waifu.fun/agent/waifu-demo-01)" },
		{ name: "event", value: "agent.dormant" },
		{ name: "creditsTopUpCount", value: "2" },
	]);
});

test("dispatchAgentEventAlert no-ops without webhook", async (t) => {
	const oldWebhook = process.env.DISCORD_OPS_WEBHOOK_URL;
	process.env.DISCORD_OPS_WEBHOOK_URL = "";
	t.after(() => {
		process.env.DISCORD_OPS_WEBHOOK_URL = oldWebhook;
		mock.restoreAll();
	});

	const fetchMock = mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));

	await dispatchAgentEventAlert(agentEvent("agent.killed"));

	assert.equal(fetchMock.mock.callCount(), 0);
});

function agentEvent(
	eventType: AgentEvent["eventType"],
	data: Record<string, unknown> = {},
	agentId: string | null = "waifu-demo-01",
): AgentEvent {
	return {
		id: "4efc9f5f-7d73-447d-9f0f-d842c8b75000",
		agentId,
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
