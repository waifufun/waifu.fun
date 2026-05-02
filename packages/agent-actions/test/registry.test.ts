import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	AdapterCapExceeded,
	AdapterError,
	type AdapterImpl,
	AdapterPermissionDenied,
	buildRoleTemplate,
	getAdapter,
	listDefaultAdapters,
	registerAdapter,
} from "../src/index.js";

const target = "0x0000000000000000000000000000000000000001" as const;

const makeAdapter = (slug: string, tier: "default" | "opt-in"): AdapterImpl => ({
	spec: {
		slug,
		name: slug,
		chains: [56],
		tier,
		contracts: {
			target,
		},
		actions: {
			ping: {
				name: "ping",
				label: "Ping",
				description: "Test ping action",
				permissions: [
					{
						label: "Ping target",
						target,
						selectors: ["0x12345678"],
						maxValuePerTx: 1n,
					},
				],
				cost: {
					feeBps: 1,
					gasEstimate: 21_000n,
				},
			},
		},
	},
	calls: {
		ping: async () => ({ ok: true }),
	},
});

describe("adapter registry", () => {
	it("registerAdapter and getAdapter round-trip by slug", () => {
		const adapter = makeAdapter("test-round-trip", "opt-in");

		registerAdapter(adapter);

		assert.equal(getAdapter("test-round-trip"), adapter);
	});

	it("listDefaultAdapters filters default tier adapters", () => {
		const defaultAdapter = makeAdapter("test-default", "default");
		const optInAdapter = makeAdapter("test-opt-in", "opt-in");

		registerAdapter(defaultAdapter);
		registerAdapter(optInAdapter);

		const slugs = listDefaultAdapters().map((adapter) => adapter.spec.slug);
		assert.ok(slugs.includes("test-default"));
		assert.ok(!slugs.includes("test-opt-in"));
	});
});

describe("role template", () => {
	it("aggregates permissions with adapter-prefixed labels", () => {
		const adapter = makeAdapter("test-role-template", "default");

		const template = buildRoleTemplate([adapter]);

		assert.deepEqual(template.permissions, [
			{
				label: "test-role-template:Ping target",
				target,
				selectors: ["0x12345678"],
				maxValuePerTx: 1n,
			},
		]);
	});
});

describe("adapter errors", () => {
	it("subclasses are distinguishable", () => {
		const denied = new AdapterPermissionDenied("denied");
		const capExceeded = new AdapterCapExceeded("cap exceeded");

		assert.ok(denied instanceof AdapterError);
		assert.ok(denied instanceof AdapterPermissionDenied);
		assert.equal(denied.name, "AdapterPermissionDenied");
		assert.ok(capExceeded instanceof AdapterError);
		assert.ok(capExceeded instanceof AdapterCapExceeded);
		assert.equal(capExceeded.name, "AdapterCapExceeded");
	});
});
