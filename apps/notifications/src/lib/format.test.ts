/**
 * Unit tests for the per-event message formatter.
 *
 * No DB, no HTTP, no env – just the pure function.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatMessage } from "./format.js";
import type { LaunchSnapshot } from "./types.js";

const ONE_BNB = 10n ** 18n;

function snapshot(overrides: Partial<LaunchSnapshot> = {}): LaunchSnapshot {
	return {
		id: "launch-1",
		tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		vaultAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		creator: "0xcccccccccccccccccccccccccccccccccccccccc",
		tier: 90,
		state: "open",
		presaleCap: 100n * ONE_BNB,
		totalDeposited: 0n,
		depositorCount: 0,
		closeTimestamp: 1_780_000_000n,
		launchTimestamp: null,
		v2Pair: null,
		tokenName: "FooBar",
		tokenTicker: "FOO",
		tokenImageUrl: null,
		createdAt: new Date("2026-05-08T10:00:00Z"),
		...overrides,
	};
}

test("round_opened formats title, cap and creator", () => {
	const m = formatMessage(
		"round_opened",
		{ kind: "round_opened" },
		snapshot(),
		{ frontendUrl: "https://waifu.fun" },
	);
	assert.match(m.title, /Launch round opened/);
	assert.match(m.title, /FooBar/);
	assert.equal(m.url, "https://waifu.fun/launch/launch-1");
	const capField = m.fields.find((f) => f.name === "Cap");
	assert.ok(capField);
	assert.equal(capField?.value, "100 BNB");
	const creatorField = m.fields.find((f) => f.name === "Creator");
	assert.ok(creatorField);
	assert.match(creatorField!.value, /0xcccc.+cccc/);
});

test("cap_hit shows 100% and depositors", () => {
	const m = formatMessage(
		"cap_hit",
		{ kind: "cap_hit", capBps: 10_000 },
		snapshot({
			totalDeposited: 100n * ONE_BNB,
			depositorCount: 42,
		}),
		{ frontendUrl: undefined },
	);
	assert.match(m.title, /Cap hit/);
	assert.match(m.description, /100\.0%/);
	const depField = m.fields.find((f) => f.name === "Depositors");
	assert.equal(depField?.value, "42");
	assert.equal(m.url, null, "no frontend URL configured -> no link");
});

test("launched includes V2 pair", () => {
	const m = formatMessage(
		"launched",
		{ kind: "launched" },
		snapshot({
			state: "launched",
			v2Pair: "0xdddddddddddddddddddddddddddddddddddddddd",
			launchTimestamp: 1_780_100_000n,
		}),
		{ frontendUrl: "https://waifu.fun" },
	);
	assert.match(m.title, /Launched/);
	const pair = m.fields.find((f) => f.name === "V2 Pair");
	assert.match(pair!.value, /0xdddd/);
	const launchedAt = m.fields.find((f) => f.name === "Launched at");
	assert.ok(launchedAt);
	// 1780100000s = 2026-05-29 ish
	assert.match(launchedAt!.value, /^2026-/);
});

test("tranche_deployed shows tranche index and threshold", () => {
	const m = formatMessage(
		"tranche_deployed",
		{ kind: "tranche_deployed", trancheIndex: 3, trancheBps: 7_500 },
		snapshot({
			totalDeposited: 75n * ONE_BNB,
			depositorCount: 30,
		}),
		{ frontendUrl: "https://waifu.fun" },
	);
	assert.match(m.title, /T3 hit/);
	const tranche = m.fields.find((f) => f.name === "Tranche");
	assert.equal(tranche?.value, "T3 (75.0%)");
	const progress = m.fields.find((f) => f.name === "Progress");
	assert.equal(progress?.value, "75.0%");
});

test("summary_24h fallbacks to tbd when v2_pair missing", () => {
	const m = formatMessage(
		"summary_24h",
		{ kind: "summary_24h" },
		snapshot({ state: "launched", launchTimestamp: 1_780_000_000n }),
		{ frontendUrl: undefined },
	);
	const pair = m.fields.find((f) => f.name === "V2 Pair");
	assert.equal(pair?.value, "tbd");
});

test("token label falls back to token address when name missing", () => {
	const m = formatMessage(
		"round_opened",
		{ kind: "round_opened" },
		snapshot({ tokenName: null, tokenTicker: null }),
		{ frontendUrl: undefined },
	);
	assert.match(m.title, /0xaaaa…aaaa/);
});
