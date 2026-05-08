/**
 * Unit tests for Discord payload + send wrapper.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { FormattedMessage } from "../types.js";
import { buildDiscordPayload, sendDiscordWebhook } from "./discord.js";

const message: FormattedMessage = {
	title: "🎯 Cap hit: Foo",
	description: "Presale just hit cap.",
	url: "https://waifu.fun/launch/abc",
	fields: [
		{ name: "Token", value: "0xaaaa…aaaa" },
		{ name: "Tier", value: "T90" },
	],
};

test("buildDiscordPayload contains one embed with mapped fields", () => {
	const payload = buildDiscordPayload("cap_hit", message);
	assert.equal(payload.embeds.length, 1);
	const embed = payload.embeds[0]!;
	assert.equal(embed.title, message.title);
	assert.equal(embed.url, message.url);
	assert.equal(embed.fields.length, 2);
	assert.equal(embed.fields[0]?.inline, true);
});

test("colors differ by event type", () => {
	const a = buildDiscordPayload("round_opened", message);
	const b = buildDiscordPayload("launched", message);
	assert.notEqual(a.embeds[0]!.color, b.embeds[0]!.color);
});

test("sendDiscordWebhook returns sent on 2xx", async () => {
	const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
	const result = await sendDiscordWebhook(
		"https://discord.example/webhook",
		buildDiscordPayload("round_opened", message),
		{ fetchImpl },
	);
	assert.equal(result.status, "sent");
	assert.equal(result.statusCode, "204");
	assert.equal(result.error, null);
});

test("sendDiscordWebhook returns failed on non-2xx", async () => {
	const fetchImpl = (async () =>
		new Response("rate limited", { status: 429, statusText: "Too Many Requests" })) as unknown as typeof fetch;
	const result = await sendDiscordWebhook(
		"https://discord.example/webhook",
		buildDiscordPayload("round_opened", message),
		{ fetchImpl },
	);
	assert.equal(result.status, "failed");
	assert.equal(result.statusCode, "429");
	assert.match(result.error ?? "", /429/);
});

test("sendDiscordWebhook surfaces network errors", async () => {
	const fetchImpl = (async () => {
		throw new Error("connect ECONNREFUSED");
	}) as unknown as typeof fetch;
	const result = await sendDiscordWebhook(
		"https://discord.example/webhook",
		buildDiscordPayload("round_opened", message),
		{ fetchImpl },
	);
	assert.equal(result.status, "failed");
	assert.match(result.error ?? "", /ECONNREFUSED/);
});
