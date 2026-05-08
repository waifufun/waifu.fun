/**
 * Unit tests for Telegram payload builder + sender.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { FormattedMessage } from "../types.js";
import { buildTelegramPayload, sendTelegramMessage } from "./telegram.js";

test("buildTelegramPayload escapes HTML and includes link", () => {
	const message: FormattedMessage = {
		title: "Title <with> & special",
		description: "Body & <script>",
		url: "https://example.com/?q=1&z=2",
		fields: [{ name: "Key&", value: "Value<>" }],
	};
	const payload = buildTelegramPayload("@channel", message);
	assert.equal(payload.chat_id, "@channel");
	assert.equal(payload.parse_mode, "HTML");
	assert.match(payload.text, /<b>Title &lt;with&gt; &amp; special<\/b>/);
	assert.match(payload.text, /Body &amp; &lt;script&gt;/);
	assert.match(payload.text, /Key&amp;/);
	assert.match(payload.text, /Value&lt;&gt;/);
	assert.match(payload.text, /<a href="https:\/\/example\.com\/\?q=1&amp;z=2">View launch<\/a>/);
});

test("buildTelegramPayload skips description and link when absent", () => {
	const message: FormattedMessage = {
		title: "Hello",
		description: "",
		url: null,
		fields: [],
	};
	const payload = buildTelegramPayload("123", message);
	assert.equal(payload.text, "<b>Hello</b>");
});

test("sendTelegramMessage returns sent on 2xx", async () => {
	const fetchImpl = (async () => new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch;
	const result = await sendTelegramMessage(
		"BOT_TOKEN",
		buildTelegramPayload("123", {
			title: "x",
			description: "",
			url: null,
			fields: [],
		}),
		{ fetchImpl },
	);
	assert.equal(result.status, "sent");
});

test("sendTelegramMessage returns failed on non-2xx and includes body", async () => {
	const fetchImpl = (async () =>
		new Response('{"ok":false,"description":"chat not found"}', {
			status: 400,
			statusText: "Bad Request",
		})) as unknown as typeof fetch;
	const result = await sendTelegramMessage(
		"BOT_TOKEN",
		buildTelegramPayload("123", { title: "x", description: "", url: null, fields: [] }),
		{ fetchImpl },
	);
	assert.equal(result.status, "failed");
	assert.match(result.error ?? "", /chat not found/);
});
