import assert from "node:assert/strict";
import test from "node:test";

import { composePostWithBlink } from "../src/lib/blink-suffix.js";

const TOKEN = "0x1234567890abcdef1234567890abcdef12345678";

test("composePostWithBlink: returns base text byte-for-byte when blinkBaseUrl is undefined", () => {
	const baseText = "Eliza just launched. some llm line → waifu.fun/agent/0xabc";
	const out = composePostWithBlink(baseText, TOKEN);
	assert.equal(out, baseText);
});

test("composePostWithBlink: returns base text byte-for-byte when blinkBaseUrl is empty/whitespace", () => {
	const baseText = "Eliza just launched.";
	assert.equal(composePostWithBlink(baseText, TOKEN, { blinkBaseUrl: "" }), baseText);
	assert.equal(composePostWithBlink(baseText, TOKEN, { blinkBaseUrl: "   " }), baseText);
});

test("composePostWithBlink: appends Blink URL on a new line when total fits in 280", () => {
	const baseText = "Eliza just launched.";
	const out = composePostWithBlink(baseText, TOKEN, { blinkBaseUrl: "https://api.waifu.fun" });
	assert.equal(out, `${baseText}\nhttps://api.waifu.fun/v2/agents/${TOKEN}/blink`);
	assert.ok(out.length <= 280);
});

test("composePostWithBlink: strips trailing slash from blinkBaseUrl before composing the URL", () => {
	const baseText = "Eliza just launched.";
	const out = composePostWithBlink(baseText, TOKEN, { blinkBaseUrl: "https://api.waifu.fun///" });
	assert.equal(out, `${baseText}\nhttps://api.waifu.fun/v2/agents/${TOKEN}/blink`);
});

test("composePostWithBlink: drops the Blink URL entirely when appending would overflow 280", () => {
	// base text already takes up most of the budget
	const baseText = "x".repeat(260);
	const out = composePostWithBlink(baseText, TOKEN, { blinkBaseUrl: "https://api.waifu.fun" });
	assert.equal(out, baseText);
	assert.ok(out.length <= 280);
	// no partial / truncated Blink URL ever appears
	assert.doesNotMatch(out, /\/blink/);
});

test("composePostWithBlink: respects a custom maxLength", () => {
	const baseText = "Eliza just launched.";
	const tight = composePostWithBlink(baseText, TOKEN, {
		blinkBaseUrl: "https://api.waifu.fun",
		maxLength: 30,
	});
	assert.equal(tight, baseText);

	const generous = composePostWithBlink(baseText, TOKEN, {
		blinkBaseUrl: "https://api.waifu.fun",
		maxLength: 1000,
	});
	assert.match(generous, /\/blink$/);
});

test("composePostWithBlink: appends only when fit is exactly the boundary", () => {
	// craft baseText so base + "\n" + blinkUrl is exactly 280 chars
	const blinkUrl = `https://api.waifu.fun/v2/agents/${TOKEN}/blink`;
	const baseLen = 280 - 1 - blinkUrl.length; // 1 for the newline
	assert.ok(baseLen > 0, "blink URL alone exceeds budget; choose a shorter token in the test");
	const baseText = "x".repeat(baseLen);

	const out = composePostWithBlink(baseText, TOKEN, { blinkBaseUrl: "https://api.waifu.fun" });
	assert.equal(out.length, 280);
	assert.match(out, /\/blink$/);

	const overflow = composePostWithBlink(`${baseText}y`, TOKEN, { blinkBaseUrl: "https://api.waifu.fun" });
	assert.equal(overflow, `${baseText}y`);
});
