import assert from "node:assert/strict";
import test from "node:test";

import { type GateDeps, type OffRampLimitsConfig, evaluateGate } from "./limits.js";

function cfg(overrides: Partial<OffRampLimitsConfig> = {}): OffRampLimitsConfig {
	return {
		autoEnabled: true,
		pauseFilePath: "/tmp/.does-not-exist-offramp-pause",
		maxPerTxUsd: 10,
		maxPerDayUsd: 20,
		minPerTxUsd: 1,
		...overrides,
	};
}

const noPause: GateDeps = { pauseFileExists: () => false };
const paused: GateDeps = { pauseFileExists: () => true };

test("kill-switch: blocks when autoEnabled is false", () => {
	const d = evaluateGate({ amountUsd: 5, spentTodayUsd: 0, automatable: true }, cfg({ autoEnabled: false }), noPause);
	assert.equal(d.allowed, false);
	if (!d.allowed) assert.equal(d.status, "killed");
});

test("kill-switch: blocks when pause file exists", () => {
	const d = evaluateGate({ amountUsd: 5, spentTodayUsd: 0, automatable: true }, cfg(), paused);
	assert.equal(d.allowed, false);
	if (!d.allowed) assert.equal(d.status, "killed");
});

test("not automatable -> skipped", () => {
	const d = evaluateGate({ amountUsd: 5, spentTodayUsd: 0, automatable: false }, cfg(), noPause);
	assert.equal(d.allowed, false);
	if (!d.allowed) assert.equal(d.status, "skipped");
});

test("below dust floor -> skipped", () => {
	const d = evaluateGate({ amountUsd: 0.5, spentTodayUsd: 0, automatable: true }, cfg(), noPause);
	assert.equal(d.allowed, false);
	if (!d.allowed) assert.equal(d.status, "skipped");
});

test("over per-tx cap -> capped", () => {
	const d = evaluateGate({ amountUsd: 11, spentTodayUsd: 0, automatable: true }, cfg(), noPause);
	assert.equal(d.allowed, false);
	if (!d.allowed) assert.equal(d.status, "capped");
});

test("daily cap reached -> capped", () => {
	const d = evaluateGate({ amountUsd: 5, spentTodayUsd: 20, automatable: true }, cfg(), noPause);
	assert.equal(d.allowed, false);
	if (!d.allowed) assert.equal(d.status, "capped");
});

test("would breach daily cap -> capped (no silent shrink)", () => {
	// $8 left today, candidate is $9 -> refuse, queue manual.
	const d = evaluateGate({ amountUsd: 9, spentTodayUsd: 12, automatable: true }, cfg(), noPause);
	assert.equal(d.allowed, false);
	if (!d.allowed) assert.equal(d.status, "capped");
});

test("within all caps -> allowed", () => {
	const d = evaluateGate({ amountUsd: 8, spentTodayUsd: 10, automatable: true }, cfg(), noPause);
	assert.equal(d.allowed, true);
	if (d.allowed) assert.equal(d.amountUsd, 8);
});

test("exactly at per-tx cap and within daily headroom -> allowed", () => {
	const d = evaluateGate({ amountUsd: 10, spentTodayUsd: 0, automatable: true }, cfg(), noPause);
	assert.equal(d.allowed, true);
});

test("amount rounded to cents", () => {
	const d = evaluateGate({ amountUsd: 7.999, spentTodayUsd: 0, automatable: true }, cfg(), noPause);
	assert.equal(d.allowed, true);
	if (d.allowed) assert.equal(d.amountUsd, 8);
});
