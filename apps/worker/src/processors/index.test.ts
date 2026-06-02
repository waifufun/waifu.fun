import assert from "node:assert/strict";
import test from "node:test";

import { createWorkerRegistrations } from "./index.js";

test("worker registers agent-provisioning on the provisioning queue", () => {
	const registrations = createWorkerRegistrations({
		db: {} as never,
		logger: console as never,
		startedAt: new Date("2026-05-29T00:00:00Z"),
		chainId: 56,
	});

	const registration = registrations.find((item) => item.jobName === "agent-provisioning");
	assert.ok(registration, "agent-provisioning worker registration missing");
	assert.equal(registration.queueKey, "provisioning");
	assert.equal(registration.queueName, "agent-provisioning");
	assert.equal(registration.concurrency, 1);
	assert.match(registration.description, /Eliza Cloud containers/);
	assert.equal(typeof registration.processor, "function");
});

test("provisioning concurrency is env-tunable via WAIFU_PROVISIONING_CONCURRENCY", () => {
	const previous = process.env.WAIFU_PROVISIONING_CONCURRENCY;
	const context = {
		db: {} as never,
		logger: console as never,
		startedAt: new Date("2026-05-29T00:00:00Z"),
		chainId: 56,
	};
	const concurrencyOf = () =>
		createWorkerRegistrations(context).find((item) => item.jobName === "agent-provisioning")?.concurrency;
	try {
		process.env.WAIFU_PROVISIONING_CONCURRENCY = "6";
		assert.equal(concurrencyOf(), 6);
		// Invalid values fall back to the serial default rather than 0/NaN.
		process.env.WAIFU_PROVISIONING_CONCURRENCY = "0";
		assert.equal(concurrencyOf(), 1);
		process.env.WAIFU_PROVISIONING_CONCURRENCY = "nope";
		assert.equal(concurrencyOf(), 1);
		delete process.env.WAIFU_PROVISIONING_CONCURRENCY;
		assert.equal(concurrencyOf(), 1);
	} finally {
		if (previous === undefined) delete process.env.WAIFU_PROVISIONING_CONCURRENCY;
		else process.env.WAIFU_PROVISIONING_CONCURRENCY = previous;
	}
});
