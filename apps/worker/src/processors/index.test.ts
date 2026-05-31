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
